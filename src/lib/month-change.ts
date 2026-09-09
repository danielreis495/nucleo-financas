import type { CategoryId, FinanceState } from "./types";
import { monthTransactions, spendByCategory, totalsForMonth } from "./selectors";
import { addMonthsKey } from "./utils";

export type CategoryChange = {
  category: CategoryId;
  current: number;
  previous: number;
  delta: number;
  percent: number | null;
};

export type MonthChange = {
  previousMonth: string;
  currentExpense: number;
  previousExpense: number;
  delta: number;
  percent: number | null;
  increases: CategoryChange[];
  decreases: CategoryChange[];
  hasComparison: boolean;
};

function percentChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

export function monthChange(state: FinanceState, month: string): MonthChange {
  const previousMonth = addMonthsKey(month, -1);
  const currentRows = monthTransactions(state, month);
  const previousRows = monthTransactions(state, previousMonth);
  const currentTotals = totalsForMonth(state, month);
  const previousTotals = totalsForMonth(state, previousMonth);
  const currentCategories = new Map(
    spendByCategory(currentRows).map((item) => [item.category, item.amount] as const),
  );
  const previousCategories = new Map(
    spendByCategory(previousRows).map((item) => [item.category, item.amount] as const),
  );
  const categoryIds = new Set([...currentCategories.keys(), ...previousCategories.keys()]);
  const changes: CategoryChange[] = [...categoryIds].map((category) => {
    const current = currentCategories.get(category) ?? 0;
    const previous = previousCategories.get(category) ?? 0;
    return {
      category,
      current,
      previous,
      delta: current - previous,
      percent: percentChange(current, previous),
    };
  });

  const meaningfulThreshold = Math.max(20, previousTotals.expense * 0.01);
  const increases = changes
    .filter((item) => item.delta >= meaningfulThreshold)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);
  const decreases = changes
    .filter((item) => item.delta <= -meaningfulThreshold)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3);

  return {
    previousMonth,
    currentExpense: currentTotals.expense,
    previousExpense: previousTotals.expense,
    delta: currentTotals.expense - previousTotals.expense,
    percent: percentChange(currentTotals.expense, previousTotals.expense),
    increases,
    decreases,
    hasComparison: currentRows.length > 0 && previousRows.length > 0,
  };
}
