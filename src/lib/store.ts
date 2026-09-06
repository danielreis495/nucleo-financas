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
  Transaction,
  TxSource,
} from "./types";
import { CATEGORIES } from "./categories";
import { findTransferCandidate } from "./integrity";
import { createSeedState } from "./seed";
import { uid, isoDate, todayIso, monthKey } from "./utils";

type FinanceActions = {
  hydrated: boolean;
  viewMonth: string;
  setHydrated: (v: boolean) => void;
  setViewMonth: (key: string) => void;
  resetDemo: () => void;
  clearAll: () => void;
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
  setTransactionTransfer: (id: string, otherAccountId: string | null) => void;
  removeTransaction: (id: string) => void;
  restoreTransaction: (tx: Transaction) => void;
  addCustomCategory: (input: { label: string; group: CategoryGroup }) => string;
  setBudget: (category: CategoryId, monthlyLimit: number) => void;
  importExtracted: (items: ExtractedItem[], source: TxSource, accountId?: string | null) => void;
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
  customCategories: [],
  advice: null,
  demo: false,
});

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
  accountId?: string | null;
}): Transaction[] {
  const start = new Date(input.startDate + "T12:00:00");
  const today = todayIso();
  const rows: Transaction[] = [];
  const current = input.currentIndex ?? 1;
  for (let i = 0; i < input.totalCount; i++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + i);
    const date = isoDate(d);
    const index = i + 1;
    const alreadyPaid = index < current || (index === current && date <= today);
    rows.push({
      id: uid(),
      date,
      description: `${input.title} ${index}/${input.totalCount}`,
      merchant: input.merchant,
      amount: input.installmentAmount,
      type: "expense",
      status: alreadyPaid || date <= today ? "posted" : "scheduled",
      category: input.category,
      personId: input.personId,
      accountId: input.accountId ?? null,
      split: null,
      installmentId: input.id,
      installmentIndex: index,
      installmentTotal: input.totalCount,
      source: "manual",
      createdAt: new Date().toISOString(),
    });
  }
  return rows;
}

function clearTransferLink(transactions: Transaction[], transactionId: string) {
  const tx = transactions.find((row) => row.id === transactionId);
  if (!tx?.transferId) return transactions;
  const transferId = tx.transferId;
  const generated = transactions.find((row) => row.transferId === transferId && row.transferGenerated);
  return transactions
    .filter((row) => !generated || row.id !== generated.id)
    .map((row) =>
      row.transferId === transferId
        ? { ...row, transferId: null, transferAccountId: null, transferGenerated: false }
        : row,
    );
}

function removeTransactionWithTransfer(transactions: Transaction[], transactionId: string) {
  const tx = transactions.find((row) => row.id === transactionId);
  if (!tx?.transferId) return transactions.filter((row) => row.id !== transactionId);
  const transferId = tx.transferId;
  const generated = transactions.find((row) => row.transferId === transferId && row.transferGenerated);
  return transactions
    .filter((row) => row.id !== transactionId && (!generated || row.id !== generated.id))
    .map((row) =>
      row.transferId === transferId
        ? { ...row, transferId: null, transferAccountId: null, transferGenerated: false }
        : row,
    );
}

export const useFinanceStore = create<FinanceState & FinanceActions>()(
  persist(
    (set, get) => ({
      ...createSeedState(),
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
          status: "posted",
          category,
          personId,
          accountId: accountId ?? null,
          split: null,
          installmentId: null,
          installmentIndex: null,
          installmentTotal: null,
          source: "manual",
          createdAt: new Date().toISOString(),
        };
        set({ transactions: [t, ...get().transactions], demo: false });
      },
      updateTransaction: (id, patch) => {
        const current = get().transactions.find((t) => t.id === id);
        if (!current?.transferId) {
          set({ transactions: get().transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
          return;
        }
        const pairPatch: Partial<Transaction> = {};
        if (patch.amount !== undefined) pairPatch.amount = patch.amount;
        if (patch.date !== undefined) pairPatch.date = patch.date;
        if (patch.status !== undefined) pairPatch.status = patch.status;
        if (patch.personId !== undefined) pairPatch.personId = patch.personId;
        set({
          transactions: get().transactions.map((t) => {
            if (t.id === id) return { ...t, ...patch };
            if (t.transferId === current.transferId) return { ...t, ...pairPatch };
            return t;
          }),
        });
      },
      setTransactionTransfer: (id, otherAccountId) => {
        const all = get().transactions;
        const current = all.find((t) => t.id === id);
        if (!current) return;

        if (!otherAccountId) {
          set({ transactions: clearTransferLink(all, id) });
          return;
        }
        if (!current.accountId || current.accountId === otherAccountId) return;

        const clean = current.transferId ? clearTransferLink(all, id) : all;
        const base = clean.find((t) => t.id === id);
        if (!base?.accountId) return;

        const transferId = uid();
        const candidate = findTransferCandidate(base, clean, otherAccountId);
        const sourceAccount = get().accounts.find((a) => a.id === base.accountId);
        const targetAccount = get().accounts.find((a) => a.id === otherAccountId);

        let transactions = clean.map((t) => {
          if (t.id === base.id) {
            return {
              ...t,
              transferId,
              transferAccountId: otherAccountId,
              transferGenerated: false,
            };
          }
          if (candidate && t.id === candidate.id) {
            return {
              ...t,
              transferId,
              transferAccountId: base.accountId,
              transferGenerated: false,
            };
          }
          return t;
        });

        if (!candidate) {
          const counterpartType = base.type === "expense" ? "income" : "expense";
          const counterpart: Transaction = {
            id: uid(),
            date: base.date,
            description: `Transferência ${sourceAccount?.name ?? "conta"} → ${targetAccount?.name ?? "conta"}`,
            merchant: "Transferência entre contas",
            amount: base.amount,
            type: counterpartType,
            status: base.status,
            category: counterpartType === "income" ? "salario" : "outros",
            personId: base.personId,
            accountId: otherAccountId,
            transferId,
            transferAccountId: base.accountId,
            transferGenerated: true,
            split: null,
            installmentId: null,
            installmentIndex: null,
            installmentTotal: null,
            source: "manual",
            createdAt: new Date().toISOString(),
          };
          transactions = [counterpart, ...transactions];
        }

        set({ transactions, demo: false });
      },
      removeTransaction: (id) =>
        set({ transactions: removeTransactionWithTransfer(get().transactions, id) }),
      restoreTransaction: (tx) => {
        if (get().transactions.some((t) => t.id === tx.id)) return;
        const restored = {
          ...tx,
          transferId: null,
          transferAccountId: null,
          transferGenerated: false,
        };
        set({ transactions: [restored, ...get().transactions] });
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
      importExtracted: (items, source, accountId = null) => {
        const selected = items.filter((i) => i.selected && i.amount > 0);
        const newPlans: FinanceState["plans"] = [];
        const newTx: Transaction[] = [];
        for (const item of selected) {
          if (item.installment && item.installment.total > 1) {
            const planId = uid();
            const start = new Date(item.date + "T12:00:00");
            start.setMonth(start.getMonth() - (item.installment.current - 1));
            newPlans.push({
              id: planId,
              title: item.description || item.merchant,
              merchant: item.merchant,
              kind: item.installment.kind,
              installmentAmount: item.amount,
              totalCount: item.installment.total,
              startDate: isoDate(start),
              personId: item.personId,
              category: item.category,
              account: "",
            });
            newTx.push(
              ...expandNewPlan({
                id: planId,
                title: item.description || item.merchant,
                merchant: item.merchant,
                kind: item.installment.kind,
                installmentAmount: item.amount,
                totalCount: item.installment.total,
                startDate: isoDate(start),
                personId: item.personId,
                category: item.category,
                currentIndex: item.installment.current,
                accountId,
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
              status: "posted",
              category: item.category,
              personId: item.personId,
              accountId: accountId ?? null,
              split: null,
              installmentId: null,
              installmentIndex: null,
              installmentTotal: null,
              source,
              createdAt: new Date().toISOString(),
            });
          }
        }
        set({
          transactions: [...newTx, ...get().transactions],
          plans: [...newPlans, ...get().plans],
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
        const txs = expandNewPlan({ ...input, id });
        set({
          plans: [plan, ...get().plans],
          transactions: [...txs, ...get().transactions],
          demo: false,
        });
      },
      setAdvice: (advice) => set({ advice }),
      advanceDueInstallments: () => {
        const today = todayIso();
        const transactions = get().transactions.map((t) => {
          if (t.status === "scheduled" && t.installmentId && t.date <= today) {
            return { ...t, status: "posted" as const };
          }
          return t;
        });
        set({ transactions });
      },
    }),
    {
      name: "nucleo-finance-v1",
      skipHydration: true,
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<FinanceState & FinanceActions>;
        return {
          ...current,
          ...saved,
          accounts: Array.isArray(saved.accounts) ? saved.accounts : [],
        };
      },
      partialize: (s) => ({
        householdName: s.householdName,
        people: s.people,
        accounts: s.accounts,
        transactions: s.transactions,
        plans: s.plans,
        budgets: s.budgets,
        customCategories: s.customCategories,
        advice: s.advice,
        demo: s.demo,
        geminiKey: s.geminiKey,
      }),
    },
  ),
);
