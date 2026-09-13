import { financialSnapshot, totalsForMonth } from "./selectors";
import { monthlyIncomeForecast } from "./forecast";
import type { FinanceState } from "./types";

const STORAGE_KEY = "nucleo-monthly-simulation-reference-v1";

export type MonthlySimulation = {
  month: string;
  expectedIncome: number;
  receivedIncome: number;
  salaryExpected: number;
  manualPlannedIncome: number;
  realizedExpense: number;
  scheduledExpense: number;
  projectedExpense: number;
  projectedResult: number;
};

export type MonthlySimulationReference = MonthlySimulation & {
  capturedAt: string;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateMonthlySimulation(
  state: FinanceState,
  month: string,
): MonthlySimulation {
  const income = monthlyIncomeForecast(state, month);
  const snapshot = financialSnapshot(state, month);

  return {
    month,
    expectedIncome: roundMoney(income.expectedTotal),
    receivedIncome: roundMoney(income.received),
    salaryExpected: roundMoney(income.salaryExpected),
    manualPlannedIncome: roundMoney(income.manualPlanned),
    realizedExpense: roundMoney(snapshot.postedExpense),
    scheduledExpense: roundMoney(snapshot.scheduledExpense),
    projectedExpense: roundMoney(snapshot.plannedOutflow),
    projectedResult: roundMoney(income.expectedTotal - snapshot.plannedOutflow),
  };
}

export function actualMonthlyResult(state: FinanceState, month: string) {
  const totals = totalsForMonth(state, month);
  return {
    income: roundMoney(totals.income),
    expense: roundMoney(totals.expense),
    result: roundMoney(totals.balance),
  };
}

function readAll(): Record<string, MonthlySimulationReference> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, MonthlySimulationReference>;
  } catch {
    return {};
  }
}

export function monthlySimulationReference(month: string) {
  return readAll()[month] ?? null;
}

export function saveMonthlySimulationReference(
  simulation: MonthlySimulation,
  capturedAt: string,
) {
  if (typeof window === "undefined") return null;
  const current = readAll();
  if (current[simulation.month]) return current[simulation.month];

  const reference: MonthlySimulationReference = {
    ...simulation,
    capturedAt,
  };
  current[simulation.month] = reference;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  return reference;
}
