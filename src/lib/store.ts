import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
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
  addQuickExpense: (input: {
    amount: number;
    category: CategoryId;
    personId: string;
    description?: string;
  }) => void;
  updateTransaction: (id: string, patch: Partial<Transaction>) => void;
  removeTransaction: (id: string) => void;
  restoreTransaction: (tx: Transaction) => void;
  addCustomCategory: (input: { label: string; group: CategoryGroup }) => string;
  setBudget: (category: CategoryId, monthlyLimit: number) => void;
  importExtracted: (items: ExtractedItem[], source: TxSource) => void;
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
      addQuickExpense: ({ amount, category, personId, description }) => {
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
          split: null,
          installmentId: null,
          installmentIndex: null,
          installmentTotal: null,
          source: "manual",
          createdAt: new Date().toISOString(),
        };
        set({ transactions: [t, ...get().transactions], demo: false });
      },
      updateTransaction: (id, patch) =>
        set({
          transactions: get().transactions.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }),
      removeTransaction: (id) =>
        set({ transactions: get().transactions.filter((t) => t.id !== id) }),
      restoreTransaction: (tx) => {
        if (get().transactions.some((t) => t.id === tx.id)) return;
        set({ transactions: [tx, ...get().transactions] });
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
      importExtracted: (items, source) => {
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
      partialize: (s) => ({
        householdName: s.householdName,
        people: s.people,
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
