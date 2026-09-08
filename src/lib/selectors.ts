import type {
  Account,
  CategoryId,
  FinanceState,
  Person,
  Transaction,
} from "./types";
import { countsInBudget, isExpenseRefund } from "./movement-nature";
import { monthKey } from "./utils";

const ESSENTIAL_CATEGORIES = new Set<CategoryId>([
  "mercado",
  "transporte",
  "moradia",
  "contas",
  "saude",
  "educacao",
]);

function validMonthKey(value: string | undefined) {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

/**
 * Mês usado nos relatórios. Cartão segue a competência da fatura; os demais
 * movimentos continuam seguindo a data real do lançamento.
 */
export function transactionMonth(t: Pick<Transaction, "date" | "originKind" | "competenceMonth">) {
  if (t.originKind === "credit_card" && validMonthKey(t.competenceMonth)) return t.competenceMonth!;
  return monthKey(t.date);
}

export function monthTransactions(
  state: FinanceState,
  key: string,
  includeScheduled = false,
  includeOutsideBudget = false,
) {
  return state.transactions.filter((t) => {
    if (transactionMonth(t) !== key) return false;
    if (!includeScheduled && t.status === "scheduled") return false;
    if (!includeOutsideBudget && !countsInBudget(t)) return false;
    return true;
  });
}

export function sumBy<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((acc, row) => acc + pick(row), 0);
}

export function accountMovement(state: FinanceState, account: Account) {
  const anchorDate = account.createdAt.slice(0, 10);
  return state.transactions
    .filter(
      (t) =>
        t.accountId === account.id &&
        t.status === "posted" &&
        t.createdAt > account.createdAt &&
        t.date >= anchorDate,
    )
    .reduce((sum, t) => sum + (t.type === "income" ? t.amount : -t.amount), 0);
}

export function accountBalance(state: FinanceState, account: Account) {
  return account.openingBalance + accountMovement(state, account);
}

export function expensesOf(rows: Transaction[]) {
  return rows.filter((t) => countsInBudget(t) && t.type === "expense");
}

function isCardCredit(t: Transaction) {
  return countsInBudget(t) && t.type === "income" && t.originKind === "credit_card";
}

export function refundsOf(rows: Transaction[]) {
  return rows.filter(
    (t) => countsInBudget(t) && t.type === "income" && (isExpenseRefund(t) || isCardCredit(t)),
  );
}

export function incomeOf(rows: Transaction[]) {
  return rows.filter(
    (t) => countsInBudget(t) && t.type === "income" && !isExpenseRefund(t) && !isCardCredit(t),
  );
}

function netExpense(rows: Transaction[]) {
  return Math.max(
    0,
    sumBy(expensesOf(rows), (t) => t.amount) - sumBy(refundsOf(rows), (t) => t.amount),
  );
}

export function totalsForMonth(state: FinanceState, key: string) {
  const rows = monthTransactions(state, key);
  const income = sumBy(incomeOf(rows), (t) => t.amount);
  const expense = netExpense(rows);
  return { income, expense, balance: income - expense, count: rows.length };
}

export function spendByCategory(rows: Transaction[]) {
  const map = new Map<CategoryId, number>();
  for (const t of expensesOf(rows)) {
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
  }
  for (const t of refundsOf(rows)) {
    map.set(t.category, (map.get(t.category) ?? 0) - t.amount);
  }
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount: Math.max(0, amount) }))
    .filter((row) => row.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function spendByPerson(rows: Transaction[], people: Person[]) {
  return people
    .map((person) => {
      const expenses = sumBy(
        expensesOf(rows).filter((t) => t.personId === person.id),
        (t) => t.amount,
      );
      const refunds = sumBy(
        refundsOf(rows).filter((t) => t.personId === person.id),
        (t) => t.amount,
      );
      return { person, amount: Math.max(0, expenses - refunds) };
    })
    .sort((a, b) => b.amount - a.amount);
}

export function dailySpend(rows: Transaction[], key: string) {
  const [y, m] = key.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  const buckets = Array.from({ length: days }, () => 0);
  for (const t of expensesOf(rows)) {
    const day = Number(t.date.slice(8, 10));
    if (day >= 1 && day <= days) buckets[day - 1] += t.amount;
  }
  for (const t of refundsOf(rows)) {
    const day = Number(t.date.slice(8, 10));
    if (day >= 1 && day <= days) buckets[day - 1] -= t.amount;
  }
  return buckets.map((value) => Math.max(0, value));
}

export function upcomingInstallments(state: FinanceState, fromIso: string, limit = 8) {
  return state.transactions
    .filter((t) => t.installmentId && t.date >= fromIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

export function planProgress(state: FinanceState, planId: string) {
  const txs = state.transactions.filter((t) => t.installmentId === planId);
  const plan = state.plans.find((p) => p.id === planId);
  const importedPast = plan?.importedCurrentIndex ? Math.max(0, plan.importedCurrentIndex - 1) : 0;
  const paidVisible = txs.filter((t) => t.status === "posted").length;
  const total = plan?.totalCount ?? txs.length;
  const paid = Math.min(total, importedPast + paidVisible);
  const remaining = txs.filter((t) => t.status === "scheduled");
  const remainingAmount = sumBy(remaining, (t) => t.amount);
  const next = remaining.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  return { paid, total, remainingAmount, next };
}

export function committedFuture(state: FinanceState, fromIso: string) {
  return sumBy(
    state.transactions.filter(
      (t) => countsInBudget(t) && t.type === "expense" && t.status === "scheduled" && t.date >= fromIso,
    ),
    (t) => t.amount,
  );
}

export function budgetUsage(state: FinanceState, key: string) {
  const rows = monthTransactions(state, key);
  const spent = spendByCategory(rows);
  return state.budgets
    .map((b) => {
      const used = spent.find((s) => s.category === b.category)?.amount ?? 0;
      return {
        ...b,
        used,
        ratio: b.monthlyLimit > 0 ? used / b.monthlyLimit : 0,
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

export function personById(people: Person[], id: string) {
  return people.find((p) => p.id === id);
}

export type FinancialSnapshot = {
  income: number;
  postedExpense: number;
  scheduledExpense: number;
  plannedOutflow: number;
  essentialExpense: number;
  variableExpense: number;
  installmentExpense: number;
  margin: number;
  spendRatio: number;
  installmentRatio: number;
  score: number | null;
  status: "Saudavel" | "Atencao" | "Apertada" | "Critica" | "Dados insuficientes";
  suggestedSavings: number;
  recoveryTarget: number;
  transactionCount: number;
  incomeCount: number;
};

function roundDown10(value: number) {
  return Math.max(0, Math.floor(value / 10) * 10);
}

export function financialSnapshot(state: FinanceState, key: string): FinancialSnapshot {
  const rows = monthTransactions(state, key, true);
  const posted = rows.filter((t) => t.status === "posted");
  const scheduled = rows.filter((t) => t.status === "scheduled");
  const postedExpenses = expensesOf(posted);
  const scheduledExpenses = expensesOf(scheduled);
  const postedRefunds = refundsOf(posted);
  const incomes = incomeOf(posted);

  const income = sumBy(incomes, (t) => t.amount);
  const postedExpense = Math.max(
    0,
    sumBy(postedExpenses, (t) => t.amount) - sumBy(postedRefunds, (t) => t.amount),
  );
  const scheduledExpense = sumBy(scheduledExpenses, (t) => t.amount);
  const plannedOutflow = postedExpense + scheduledExpense;

  const postedByCategory = spendByCategory(posted);
  const essentialExpense = sumBy(
    postedByCategory.filter((row) => ESSENTIAL_CATEGORIES.has(row.category)),
    (row) => row.amount,
  );
  const variableExpense = Math.max(0, postedExpense - essentialExpense);
  const installmentExpense = sumBy(
    expensesOf(rows).filter((t) => Boolean(t.installmentId)),
    (t) => t.amount,
  );
  const margin = income - plannedOutflow;
  const spendRatio = income > 0 ? plannedOutflow / income : 0;
  const installmentRatio = income > 0 ? installmentExpense / income : 0;

  let score: number | null = null;
  if (income > 0) {
    let points = 100;
    if (spendRatio > 1) points -= 55;
    else if (spendRatio > 0.9) points -= 38;
    else if (spendRatio > 0.75) points -= 22;
    else if (spendRatio > 0.6) points -= 10;

    if (installmentRatio > 0.3) points -= 20;
    else if (installmentRatio > 0.2) points -= 12;
    else if (installmentRatio > 0.1) points -= 5;

    if (margin / income >= 0.2) points += 5;
    score = Math.max(0, Math.min(100, Math.round(points)));
  }

  const status =
    score === null
      ? "Dados insuficientes"
      : score >= 80
        ? "Saudavel"
        : score >= 60
          ? "Atencao"
          : score >= 40
            ? "Apertada"
            : "Critica";

  let suggestedSavings = 0;
  if (income > 0 && margin > 0) {
    const raw =
      spendRatio > 0.9
        ? Math.min(margin * 0.25, income * 0.03)
        : spendRatio > 0.75
          ? Math.min(margin * 0.35, income * 0.05)
          : Math.min(margin * 0.5, income * 0.1);
    suggestedSavings = roundDown10(raw);
  }

  const recoveryTarget = margin < 0 && income > 0 ? roundDown10(Math.abs(margin) + income * 0.05) : 0;

  return {
    income,
    postedExpense,
    scheduledExpense,
    plannedOutflow,
    essentialExpense,
    variableExpense,
    installmentExpense,
    margin,
    spendRatio,
    installmentRatio,
    score,
    status,
    suggestedSavings,
    recoveryTarget,
    transactionCount: posted.length,
    incomeCount: incomes.length,
  };
}
