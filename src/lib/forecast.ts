import { countsInBudget } from "./movement-nature";
import { recurringExpenses } from "./recurring";
import type { FinanceState, Transaction } from "./types";

export type ForecastItem = {
  key: string;
  date: string;
  label: string;
  amount: number;
  type: "expense" | "income";
  source: "scheduled" | "recurring";
  confidence: "confirmed" | "high" | "medium";
};

export type CashFlowForecast = {
  fromDate: string;
  toDate: string;
  scheduledExpenses: number;
  scheduledIncome: number;
  predictedRecurring: number;
  expectedOutflow: number;
  expectedNet: number;
  items: ForecastItem[];
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function daysApart(left: string, right: string) {
  const a = new Date(`${left}T12:00:00`).getTime();
  const b = new Date(`${right}T12:00:00`).getTime();
  return Math.abs(a - b) / 86_400_000;
}

function amountClose(a: number, b: number) {
  const tolerance = Math.max(5, Math.max(a, b) * 0.2);
  return Math.abs(a - b) <= tolerance;
}

function scheduledRows(state: Pick<FinanceState, "transactions">, fromIso: string, toIso: string) {
  return state.transactions.filter(
    (row) =>
      row.status === "scheduled" &&
      countsInBudget(row) &&
      row.date >= fromIso &&
      row.date <= toIso,
  );
}

function matchesScheduledRecurring(
  recurring: { merchant: string; nextDate: string; averageAmount: number },
  scheduled: Transaction[],
) {
  const merchant = normalize(recurring.merchant);
  return scheduled.some((row) => {
    if (row.type !== "expense") return false;
    const rowMerchant = normalize(row.merchant);
    const sameMerchant =
      rowMerchant === merchant ||
      (rowMerchant.length >= 5 && merchant.length >= 5 && (rowMerchant.includes(merchant) || merchant.includes(rowMerchant)));
    return sameMerchant && daysApart(row.date, recurring.nextDate) <= 7 && amountClose(row.amount, recurring.averageAmount);
  });
}

/**
 * Projeção somente de leitura: combina lançamentos já agendados com recorrências
 * detectadas pelo histórico. Não persiste previsões e evita contar uma recorrência
 * quando já existe um lançamento agendado equivalente.
 */
export function cashFlowForecast(
  state: Pick<FinanceState, "transactions">,
  fromIso: string,
  horizonDays = 30,
): CashFlowForecast {
  const toDate = addDays(fromIso, horizonDays);
  const scheduled = scheduledRows(state, fromIso, toDate);
  const recurring = recurringExpenses(state, 24)
    .filter((row) => row.nextDate >= fromIso && row.nextDate <= toDate)
    .filter((row) => !matchesScheduledRecurring(row, scheduled));

  const scheduledExpenses = scheduled
    .filter((row) => row.type === "expense")
    .reduce((sum, row) => sum + row.amount, 0);
  const scheduledIncome = scheduled
    .filter((row) => row.type === "income")
    .reduce((sum, row) => sum + row.amount, 0);
  const predictedRecurring = recurring.reduce((sum, row) => sum + row.averageAmount, 0);

  const scheduledItems: ForecastItem[] = scheduled.map((row) => ({
    key: `scheduled:${row.id}`,
    date: row.date,
    label: row.merchant || row.description,
    amount: row.amount,
    type: row.type,
    source: "scheduled",
    confidence: "confirmed",
  }));

  const recurringItems: ForecastItem[] = recurring.map((row) => ({
    key: `recurring:${row.key}:${row.nextDate}`,
    date: row.nextDate,
    label: row.merchant,
    amount: row.averageAmount,
    type: "expense",
    source: "recurring",
    confidence: row.confidence,
  }));

  const items = [...scheduledItems, ...recurringItems].sort(
    (a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, "pt-BR"),
  );
  const expectedOutflow = scheduledExpenses + predictedRecurring;

  return {
    fromDate: fromIso,
    toDate,
    scheduledExpenses,
    scheduledIncome,
    predictedRecurring,
    expectedOutflow,
    expectedNet: scheduledIncome - expectedOutflow,
    items,
  };
}
