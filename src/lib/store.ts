import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Account,
  AccountType,
  AdviceCache,
  CategoryBudget,
  CategoryGroup,
  CategoryId,
  CustomCategory,
  ExtractedItem,
  FinanceState,
  InstallmentKind,
  Person,
  PersonColor,
  PersonRole,
  PlannedIncome,
  Transaction,
  TxNature,
  TxSource,
} from "./types";
import { CATEGORIES } from "./categories";
import {
  allowsManualInstallmentPayment,
  isInstallmentReconciliationCandidate,
  matchImportedInstallment,
} from "./installment-rules";
import { natureOf, reconcileTransactionNatures } from "./movement-nature";
import { createSeedState } from "./seed";
import { paymentMethodForItem, type ImportOrigin } from "./transaction-origin";
import { uid, addMonthsIso, todayIso, monthKey } from "./utils";

type FinanceActions = {
  confirmInstallmentPaid: (
    id: string,
    payment: { date: string; accountId: string } | null,
  ) => boolean;
  updateInstallmentKind: (id: string, kind: InstallmentKind) => boolean;
  updateInstallmentCategory: (id: string, category: CategoryId) => boolean;
  reconcileInstallment: (installmentId: string, paymentId: string | null) => boolean;
  removeInstallmentPlan: (id: string) => boolean;
  hydrated: boolean;
  viewMonth: string;
  setHydrated: (v: boolean) => void;
  setViewMonth: (key: string) => void;
  resetDemo: () => void;
  clearAll: () => void;
  clearFinancialHistory: () => void;
  reclassifyMovements: () => void;
  setHouseholdName: (name: string) => void;
  addPerson: (input: { name: string; role: PersonRole; color: PersonColor }) => void;
  updatePerson: (id: string, patch: Partial<Person>) => void;
  removePerson: (id: string) => void;
  addAccount: (input: {
    name: string;
    institution: string;
    type: AccountType;
    openingBalance: number;
  }) => void;
  updateAccount: (id: string, patch: Partial<Account>) => void;
  removeAccount: (id: string) => void;
  addQuickExpense: (input: {
    amount: number;
    category: CategoryId;
    personId: string;
    description?: string;
    accountId?: string | null;
  }) => void;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  removeTransaction: (id: string) => void;
  restoreTransaction: (tx: Transaction) => void;
  addCustomCategory: (input: { label: string; group: CategoryGroup }) => string;
  setBudget: (category: CategoryId, monthlyLimit: number) => void;
  addPlannedIncome: (input: { label: string; amount: number; date: string }) => void;
  updatePlannedIncome: (id: string, patch: Partial<PlannedIncome>) => void;
  removePlannedIncome: (id: string) => void;
  importExtracted: (
    items: ExtractedItem[],
    source: TxSource,
    accountId?: string | null,
    origin?: ImportOrigin,
  ) => void;
  addInstallmentPlan: (input: {
    title: string;
    merchant: string;
    kind: InstallmentKind;
    installmentAmount: number;
    totalCount: number;
    startDate: string;
    personId: string;
    category: CategoryId;
    account?: string;
    currentIndex?: number;
  }) => void;
  setAdvice: (advice: AdviceCache | null) => void;
  advanceDueInstallments: () => void;
  geminiKey: string;
  setGeminiKey: (key: string) => void;
};

const emptyState = (): FinanceState => ({
  householdName: "Minha casa",
  people: [
    { id: "p-you", name: "Você", role: "you", color: "p1", monthlyBudget: null },
    { id: "p-casa", name: "Casa", role: "other", color: "p4", monthlyBudget: null },
  ],
  accounts: [],
  transactions: [],
  plans: [],
  budgets: [],
  plannedIncomes: [],
  customCategories: [],
  advice: null,
  demo: false,
});

function addMonthsKey(key: string, delta: number) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1 + delta, 1, 12, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function expandNewPlan(input: {
  id: string;
  title: string;
  merchant: string;
  kind: InstallmentKind;
  installmentAmount: number;
  totalCount: number;
  startDate: string;
  personId: string;
  category: CategoryId;
  currentIndex?: number;
  currentSourceDate?: string;
  accountId?: string | null;
  source?: TxSource;
  nature?: TxNature;
  natureLocked?: boolean;
  origin?: ImportOrigin;
  paymentMethod?: string;
  /** Veio de um documento: a parcela atual é real e as anteriores não são inventadas. */
  imported?: boolean;
}): Transaction[] {
  const rows: Transaction[] = [];
  const current = Math.min(Math.max(1, input.currentIndex ?? 1), input.totalCount);
  const imported = Boolean(input.imported);
  const cardByBill =
    input.origin?.originKind === "credit_card" && Boolean(input.origin.competenceMonth);
  const firstIndex = imported ? current : 1;
  const anchorDate = imported ? (input.currentSourceDate ?? input.startDate) : input.startDate;

  for (let index = firstIndex; index <= input.totalCount; index++) {
    const offset = imported ? index - current : index - 1;
    const date = addMonthsIso(anchorDate, offset);
    const status: "posted" | "scheduled" = imported && index === current ? "posted" : "scheduled";
    const competenceMonth =
      cardByBill && input.origin?.competenceMonth
        ? addMonthsKey(input.origin.competenceMonth, index - current)
        : undefined;

    rows.push({
      id: uid(),
      date,
      description: `${input.title} ${index}/${input.totalCount}`,
      merchant: input.merchant,
      amount: input.installmentAmount,
      type: "expense",
      nature: input.nature ?? "budget",
      natureLocked: input.natureLocked,
      status,
      category: input.category,
      personId: input.personId,
      accountId: input.accountId ?? null,
      split: null,
      installmentId: input.id,
      installmentIndex: index,
      installmentTotal: input.totalCount,
      source: input.source ?? "manual",
      originLabel: input.origin?.originLabel,
      originInstitution: input.origin?.originInstitution,
      originKind: input.origin?.originKind,
      sourceFileName: input.origin?.sourceFileName,
      paymentMethod: input.paymentMethod,
      competenceMonth,
      createdAt: new Date().toISOString(),
    });
  }
  return rows;
}

const PAYMENT_FIELDS: (keyof Transaction)[] = ["date", "accountId", "status", "amount", "type"];

function changesAny(row: Transaction, patch: Partial<Transaction>, keys: (keyof Transaction)[]) {
  return keys.some((key) => key in patch && patch[key] !== row[key]);
}

function paymentLinkBroken(rows: Transaction[], paymentId: string, patch: Partial<Transaction>) {
  const payment = rows.find((row) => row.id === paymentId);
  if (!payment) return true;
  return changesAny(payment, patch, ["amount", "type", "status", "nature"]);
}

export const useFinanceStore = create<FinanceState & FinanceActions>()(
  persist(
    (set, get) => ({
      ...createSeedState(),
      updateInstallmentKind: (id, kind) => {
        if (!["loan", "card", "other"].includes(kind) || !get().plans.some((p) => p.id === id))
          return false;
        // Tipo do cadastro não reclassifica movimentos já importados de uma fatura.
        set({ plans: get().plans.map((p) => (p.id === id ? { ...p, kind } : p)), advice: null });
        return true;
      },
      updateInstallmentCategory: (id, category) => {
        const state = get();
        if (!category || !state.plans.some((plan) => plan.id === id)) return false;
        set({
          plans: state.plans.map((plan) => (plan.id === id ? { ...plan, category } : plan)),
          transactions: state.transactions.map((transaction) =>
            transaction.installmentId === id ? { ...transaction, category } : transaction,
          ),
          advice: null,
        });
        return true;
      },
      confirmInstallmentPaid: (id, payment) => {
        const row = get().transactions.find((t) => t.id === id);
        const plan = row?.installmentId
          ? get().plans.find((item) => item.id === row.installmentId)
          : undefined;
        if (
          !row?.installmentId ||
          !plan ||
          row.reconciledPaymentId ||
          row.type !== "expense" ||
          natureOf(row) !== "budget"
        )
          return false;
        if (payment) {
          if (
            !allowsManualInstallmentPayment(plan.kind) ||
            row.manualPayment ||
            !/^\d{4}-\d{2}-\d{2}$/.test(payment.date) ||
            !Number.isFinite(Date.parse(payment.date)) ||
            new Date(payment.date).toISOString().slice(0, 10) !== payment.date ||
            payment.date > todayIso() ||
            !get().accounts.some((a) => a.id === payment.accountId && a.active)
          )
            return false;
        } else if (!row.manualPayment) return false;
        const at = new Date().toISOString();
        const updated: Transaction = payment
          ? {
              ...row,
              date: payment.date,
              accountId: payment.accountId,
              status: "posted",
              manualPayment: {
                confirmedAt: at,
                previous: { date: row.date, status: row.status, accountId: row.accountId },
              },
            }
          : { ...row, ...row.manualPayment!.previous, manualPayment: undefined };
        updated.reconciliationHistory = [
          ...(row.reconciliationHistory ?? []),
          { paymentId: id, at, action: payment ? "manual" : "undo_manual" },
        ];
        set({
          transactions: get().transactions.map((t) => (t.id === id ? updated : t)),
          advice: null,
        });
        return true;
      },
      reconcileInstallment: (installmentId, paymentId) => {
        const rows = get().transactions;
        const installment = rows.find((row) => row.id === installmentId);
        const plan = installment?.installmentId
          ? get().plans.find((item) => item.id === installment.installmentId)
          : undefined;
        if (!installment?.installmentId || !plan) return false;
        if (paymentId) {
          const payment = rows.find((row) => row.id === paymentId);
          if (
            installment.manualPayment ||
            installment.reconciledPaymentId ||
            !payment ||
            !isInstallmentReconciliationCandidate(installment, payment, [
              plan.title,
              plan.merchant,
              installment.merchant,
              installment.description,
            ]) ||
            rows.some((row) => row.reconciledPaymentId === paymentId)
          )
            return false;
        } else if (!installment.reconciledPaymentId) return false;
        const event = {
          paymentId: paymentId ?? installment.reconciledPaymentId!,
          at: new Date().toISOString(),
          action: paymentId ? ("link" as const) : ("unlink" as const),
        };
        set({
          transactions: rows.map((row) =>
            row.id === installmentId
              ? {
                  ...row,
                  reconciledPaymentId: paymentId ?? undefined,
                  reconciliationHistory: [...(row.reconciliationHistory ?? []), event],
                }
              : row,
          ),
          advice: null,
        });
        return true;
      },
      removeInstallmentPlan: (id) => {
        const state = get();
        if (!state.plans.some((plan) => plan.id === id)) return false;

        set({
          plans: state.plans.filter((plan) => plan.id !== id),
          // Parcelas previstas somem com o plano. Parcelas que já aconteceram
          // (vieram de fatura/extrato ou tiveram pagamento confirmado) são gastos
          // reais: continuam no extrato, só sem o vínculo com o plano.
          transactions: state.transactions.flatMap((transaction) => {
            if (transaction.installmentId !== id) return [transaction];
            if (transaction.status !== "posted") return [];
            return [{ ...transaction, installmentId: null, manualPayment: undefined }];
          }),
          advice: null,
        });
        return true;
      },
      hydrated: false,
      viewMonth: monthKey(new Date()),
      geminiKey: "",
      setHydrated: (v) => set({ hydrated: v }),
      setViewMonth: (viewMonth) => set({ viewMonth }),
      setGeminiKey: (key) => set({ geminiKey: key.trim() }),
      resetDemo: () =>
        set({
          ...createSeedState(),
          hydrated: true,
          viewMonth: monthKey(new Date()),
          geminiKey: get().geminiKey,
          customCategories: get().customCategories,
        }),
      clearAll: () =>
        set({
          ...emptyState(),
          hydrated: true,
          viewMonth: monthKey(new Date()),
          geminiKey: get().geminiKey,
          customCategories: get().customCategories,
        }),
      clearFinancialHistory: () => set({ transactions: [], plans: [], advice: null, demo: false }),
      reclassifyMovements: () =>
        set({ transactions: reconcileTransactionNatures(get().transactions), advice: null }),
      setHouseholdName: (householdName) => set({ householdName }),
      addPerson: ({ name, role, color }) =>
        set({
          people: [...get().people, { id: uid(), name, role, color, monthlyBudget: null }],
        }),
      updatePerson: (id, patch) =>
        set({
          people: get().people.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }),
      removePerson: (id) => {
        const { people, transactions, plans } = get();
        if (people.length <= 1) return;
        const fallback = people.find((p) => p.id !== id)?.id;
        if (!fallback) return;
        set({
          people: people.filter((p) => p.id !== id),
          transactions: transactions.map((t) =>
            t.personId === id ? { ...t, personId: fallback } : t,
          ),
          plans: plans.map((p) => (p.personId === id ? { ...p, personId: fallback } : p)),
        });
      },
      addAccount: ({ name, institution, type, openingBalance }) => {
        const trimmedName = name.trim();
        if (!trimmedName) return;
        const account: Account = {
          id: uid(),
          name: trimmedName,
          institution: institution.trim(),
          type,
          openingBalance: Number.isFinite(openingBalance) ? openingBalance : 0,
          createdAt: new Date().toISOString(),
          active: true,
        };
        set({ accounts: [account, ...get().accounts], demo: false });
      },
      updateAccount: (id, patch) =>
        set({ accounts: get().accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }),
      removeAccount: (id) => {
        const linked = get().transactions.some((t) => t.accountId === id);
        if (linked) {
          set({ accounts: get().accounts.map((a) => (a.id === id ? { ...a, active: false } : a)) });
          return;
        }
        set({ accounts: get().accounts.filter((a) => a.id !== id) });
      },
      addQuickExpense: ({ amount, category, personId, description, accountId }) => {
        const date = todayIso();
        const t: Transaction = {
          id: uid(),
          date,
          description: description || "Gasto rápido",
          merchant: description || "Lançamento",
          amount,
          type: "expense",
          nature: "budget",
          status: "posted",
          category,
          personId,
          accountId: accountId ?? null,
          split: null,
          installmentId: null,
          installmentIndex: null,
          installmentTotal: null,
          source: "manual",
          originLabel: "Lançamento manual",
          originKind: "manual",
          paymentMethod: "Manual",
          createdAt: new Date().toISOString(),
        };
        set({ transactions: [t, ...get().transactions], demo: false });
      },
      updateTransaction: (id, patch) =>
        set({
          transactions: get().transactions.map((t) => {
            const at = new Date().toISOString();
            const self = t.id === id;
            const history = [...(t.reconciliationHistory ?? [])];
            let next: Transaction = self ? { ...t, ...patch } : t;

            // Baixa manual só é desfeita quando os dados do pagamento mudam.
            if (self && t.manualPayment && changesAny(t, patch, PAYMENT_FIELDS)) {
              next = { ...next, manualPayment: undefined };
              history.push({ paymentId: id, at, action: "undo_manual" });
            }

            // Conciliação só é desfeita quando a mudança invalida o vínculo
            // (valor, tipo, situação ou natureza). Origem, categoria e descrição não.
            const linkBroken =
              t.reconciledPaymentId &&
              ((self && changesAny(t, patch, ["amount", "type"])) ||
                (t.reconciledPaymentId === id && paymentLinkBroken(get().transactions, id, patch)));
            if (linkBroken) {
              history.push({ paymentId: t.reconciledPaymentId!, at, action: "unlink" });
              next = { ...next, reconciledPaymentId: undefined };
            }

            if (next !== t && history.length !== (t.reconciliationHistory ?? []).length) {
              next = { ...next, reconciliationHistory: history };
            }
            return next;
          }),
          advice: null,
        }),
      removeTransaction: (id) =>
        set({
          transactions: get()
            .transactions.filter((t) => t.id !== id)
            .map((t) =>
              t.reconciledPaymentId === id
                ? {
                    ...t,
                    reconciledPaymentId: undefined,
                    reconciliationHistory: [
                      ...(t.reconciliationHistory ?? []),
                      { paymentId: id, at: new Date().toISOString(), action: "unlink" as const },
                    ],
                  }
                : t,
            ),
          advice: null,
        }),
      restoreTransaction: (tx) => {
        if (get().transactions.some((t) => t.id === tx.id)) return;
        set({ transactions: [tx, ...get().transactions], advice: null });
      },
      addCustomCategory: ({ label, group }) => {
        const trimmed = label.trim();
        if (!trimmed) return "outros";
        const pool = [...CATEGORIES, ...(get().customCategories ?? [])];
        const existing = pool.find((c) => c.label.toLowerCase() === trimmed.toLowerCase());
        if (existing) return existing.id;
        let id = trimmed
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 32);
        if (!id || pool.some((c) => c.id === id)) id = `c-${uid().slice(0, 8)}`;
        const next: CustomCategory = { id, label: trimmed, group };
        set({ customCategories: [...(get().customCategories ?? []), next] });
        return id;
      },
      setBudget: (category, monthlyLimit) => {
        const budgets = get().budgets;
        const exists = budgets.some((b) => b.category === category);
        const next: CategoryBudget[] = exists
          ? budgets.map((b) => (b.category === category ? { ...b, monthlyLimit } : b))
          : [...budgets, { category, monthlyLimit }];
        set({ budgets: next });
      },
      addPlannedIncome: ({ label, amount, date }) => {
        const trimmed = label.trim();
        if (
          !trimmed ||
          !Number.isFinite(amount) ||
          amount <= 0 ||
          !/^\d{4}-\d{2}-\d{2}$/.test(date)
        )
          return;
        const item: PlannedIncome = {
          id: uid(),
          label: trimmed,
          amount,
          date,
          fulfilled: false,
          createdAt: new Date().toISOString(),
        };
        set({ plannedIncomes: [item, ...(get().plannedIncomes ?? [])], demo: false });
      },
      updatePlannedIncome: (id, patch) =>
        set({
          plannedIncomes: (get().plannedIncomes ?? []).map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
        }),
      removePlannedIncome: (id) =>
        set({ plannedIncomes: (get().plannedIncomes ?? []).filter((item) => item.id !== id) }),
      importExtracted: (items, source, accountId = null, origin) => {
        const selected = items.filter((i) => i.selected && i.amount > 0);
        const newPlans: FinanceState["plans"] = [];
        const newTx: Transaction[] = [];
        // Cópia de trabalho: parcelas previstas que este documento realiza.
        const existing = [...get().transactions];
        const existingPlans = get().plans;
        const cardByBill = origin?.originKind === "credit_card" && Boolean(origin.competenceMonth);

        const originFields = (item: ExtractedItem) => ({
          source,
          originLabel: origin?.originLabel,
          originInstitution: origin?.originInstitution,
          originKind: origin?.originKind,
          sourceFileName: origin?.sourceFileName,
          paymentMethod: origin ? paymentMethodForItem(item, origin) : undefined,
        });

        for (const item of selected) {
          const nature = natureOf(item);

          if (item.installment && item.installment.total > 1 && nature === "budget") {
            const total = item.installment.total;
            const current = Math.min(Math.max(1, item.installment.current), total);
            const match = matchImportedInstallment(
              { ...item, installment: { current, total } },
              origin?.originInstitution,
              [...newPlans, ...existingPlans],
              [...newTx, ...existing],
            );

            if (match?.kind === "already_imported") continue;

            if (match?.kind === "realize") {
              const index = existing.findIndex((row) => row.id === match.rowId);
              const inNew = newTx.findIndex((row) => row.id === match.rowId);
              const row = index >= 0 ? existing[index] : newTx[inNew];
              const realized: Transaction = {
                ...row,
                ...originFields(item),
                date: item.date,
                status: "posted",
                accountId: accountId ?? row.accountId ?? null,
                competenceMonth: cardByBill ? origin?.competenceMonth : row.competenceMonth,
              };
              if (index >= 0) existing[index] = realized;
              else newTx[inNew] = realized;
              continue;
            }

            if (match?.kind === "add_row") {
              const plan = [...newPlans, ...existingPlans].find((entry) => entry.id === match.planId)!;
              newTx.push({
                id: uid(),
                date: item.date,
                description: `${plan.title} ${current}/${total}`,
                merchant: plan.merchant,
                amount: item.amount,
                type: "expense",
                nature,
                natureLocked: item.natureLocked,
                status: "posted",
                category: plan.category,
                personId: plan.personId,
                accountId: accountId ?? null,
                split: null,
                installmentId: plan.id,
                installmentIndex: current,
                installmentTotal: total,
                ...originFields(item),
                competenceMonth: cardByBill ? origin?.competenceMonth : undefined,
                createdAt: new Date().toISOString(),
              });
              continue;
            }

            const planId = uid();
            const startDate =
              cardByBill && origin?.competenceMonth
                ? `${addMonthsKey(origin.competenceMonth, -(current - 1))}-01`
                : addMonthsIso(item.date, -(current - 1));

            newPlans.push({
              id: planId,
              title: item.description || item.merchant,
              merchant: item.merchant,
              kind: item.installment.kind,
              installmentAmount: item.amount,
              totalCount: total,
              startDate,
              personId: item.personId,
              category: item.category,
              account: "",
              importedCurrentIndex: current,
            });
            newTx.push(
              ...expandNewPlan({
                id: planId,
                title: item.description || item.merchant,
                merchant: item.merchant,
                kind: item.installment.kind,
                installmentAmount: item.amount,
                totalCount: total,
                startDate,
                currentSourceDate: item.date,
                personId: item.personId,
                category: item.category,
                currentIndex: current,
                accountId,
                source,
                nature,
                natureLocked: item.natureLocked,
                origin,
                paymentMethod: originFields(item).paymentMethod,
                imported: true,
              }),
            );
          } else {
            newTx.push({
              id: uid(),
              date: item.date,
              description: item.description,
              merchant: item.merchant,
              amount: item.amount,
              type: item.type,
              nature,
              natureLocked: item.natureLocked,
              status: "posted",
              category: item.category,
              personId: item.personId,
              accountId: accountId ?? null,
              split: null,
              installmentId: null,
              installmentIndex: null,
              installmentTotal: null,
              ...originFields(item),
              competenceMonth: cardByBill ? origin?.competenceMonth : undefined,
              createdAt: new Date().toISOString(),
            });
          }
        }
        set({
          transactions: reconcileTransactionNatures([...newTx, ...existing]),
          plans: [...newPlans, ...existingPlans],
          advice: null,
          demo: false,
        });
      },
      addInstallmentPlan: (input) => {
        const id = uid();
        const plan = {
          id,
          title: input.title,
          merchant: input.merchant,
          kind: input.kind,
          installmentAmount: input.installmentAmount,
          totalCount: input.totalCount,
          startDate: input.startDate,
          personId: input.personId,
          category: input.category,
          account: input.account ?? "",
        };
        const txs = expandNewPlan({ ...input, id, nature: "budget", source: "manual" });
        set({
          plans: [plan, ...get().plans],
          transactions: [...txs, ...get().transactions],
          advice: null,
          demo: false,
        });
      },
      setAdvice: (advice) => set({ advice }),
      advanceDueInstallments: () => {
        // Vencimento não comprova pagamento. A baixa exige conciliação explícita.
      },
    }),
    {
      name: "nucleo-finance-v1",
      skipHydration: true,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<FinanceState & FinanceActions>;
        const savedTransactions = Array.isArray(saved.transactions) ? saved.transactions : [];
        return {
          ...current,
          ...saved,
          accounts: Array.isArray(saved.accounts) ? saved.accounts : [],
          plannedIncomes: Array.isArray(saved.plannedIncomes) ? saved.plannedIncomes : [],
          transactions: reconcileTransactionNatures(savedTransactions),
        };
      },
      partialize: (s) => ({
        householdName: s.householdName,
        people: s.people,
        accounts: s.accounts,
        transactions: s.transactions,
        plans: s.plans,
        budgets: s.budgets,
        plannedIncomes: s.plannedIncomes,
        customCategories: s.customCategories,
        advice: s.advice,
        demo: s.demo,
        geminiKey: s.geminiKey,
      }),
    },
  ),
);
