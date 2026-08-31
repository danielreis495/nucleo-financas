import type {
  CategoryId,
  FinanceState,
  Person,
  Transaction,
} from "./types";
import { monthKey } from "./utils";

export function monthTransactions(state: FinanceState, key: string, includeScheduled = false) {
  return state.transactions.filter((t) => {
    if (monthKey(t.date) !== key) return false;
    if (!includeScheduled && t.status === "scheduled") return false;
    return true;
  });
}

export function sumBy<T>(rows: T[], pick: (row: T) => number) {
  return rows.reduce((acc, row) => acc + pick(row), 0);
}

export function expensesOf(rows: Transaction[]) {
  return rows.filter((t) => t.type === "expense");
}

export function incomeOf(rows: Transaction[]) {
  return rows.filter((t) => t.type === "income");
}

export function totalsForMonth(state: FinanceState, key: string) {
  const rows = monthTransactions(state, key);
  const income = sumBy(incomeOf(rows), (t) => t.amount);
  const expense = sumBy(expensesOf(rows), (t) => t.amount);
  return { income, expense, balance: income - expense, count: rows.length };
}

export function spendByCategory(rows: Transaction[]) {
  const map = new Map<CategoryId, number>();
  for (const t of expensesOf(rows)) {
    map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
  }
  return [...map.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function spendByPerson(rows: Transaction[], people: Person[]) {
  return people
    .map((person) => ({
      person,
      amount: sumBy(
        expensesOf(rows).filter((t) => t.personId === person.id),
        (t) => t.amount,
      ),
    }))
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
  return buckets;
}

export function upcomingInstallments(state: FinanceState, fromIso: string, limit = 8) {
  return state.transactions
    .filter((t) => t.installmentId && t.date >= fromIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, limit);
}

export function planProgress(state: FinanceState, planId: string) {
  const txs = state.transactions.filter((t) => t.installmentId === planId);
  const paid = txs.filter((t) => t.status === "posted").length;
  const remaining = txs.filter((t) => t.status === "scheduled");
  const remainingAmount = sumBy(remaining, (t) => t.amount);
  const next = remaining.sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
  return { paid, total: txs.length, remainingAmount, next };
}

export function committedFuture(state: FinanceState, fromIso: string) {
  return sumBy(
    state.transactions.filter(
      (t) => t.type === "expense" && t.status === "scheduled" && t.date >= fromIso,
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
