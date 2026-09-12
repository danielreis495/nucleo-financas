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

export type LikelySalary = {
  date: string;
  estimatedAmount: number;
  confidence: "confirmed" | "high" | "medium" | "low";
  observedMonths: number;
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

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

function addOneMonth(iso: string) {
  const date = new Date(`${iso}T12:00:00`);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  const lastDay = new Date(date.getFullYear(), date.getMonth() + 1, 0, 12).getDate();
  date.setDate(Math.min(day, lastDay));
  return isoDate(date);
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
      (rowMerchant.length >= 5 &&
        merchant.length >= 5 &&
        (rowMerchant.includes(merchant) || merchant.includes(rowMerchant)));
    return (
      sameMerchant &&
      daysApart(row.date, recurring.nextDate) <= 7 &&
      amountClose(row.amount, recurring.averageAmount)
    );
  });
}

function recurringOccurrences(
  state: Pick<FinanceState, "transactions">,
  fromIso: string,
  toIso: string,
  scheduled: Transaction[],
) {
  const out: {
    key: string;
    merchant: string;
    averageAmount: number;
    nextDate: string;
    confidence: "high" | "medium";
  }[] = [];

  for (const recurring of recurringExpenses(state, 24)) {
    let nextDate = recurring.nextDate;
    while (nextDate < fromIso) nextDate = addOneMonth(nextDate);

    while (nextDate <= toIso) {
      const occurrence = { ...recurring, nextDate };
      if (!matchesScheduledRecurring(occurrence, scheduled)) {
        out.push({
          key: recurring.key,
          merchant: recurring.merchant,
          averageAmount: recurring.averageAmount,
          nextDate,
          confidence: recurring.confidence,
        });
      }
      nextDate = addOneMonth(nextDate);
    }
  }
  return out;
}

/**
 * Projeção somente de leitura: combina lançamentos já agendados com recorrências
 * detectadas pelo histórico. Em horizontes maiores que 30 dias, repete as
 * recorrências mensalmente até o fim da janela e evita contar uma recorrência
 * quando já existe um lançamento agendado equivalente.
 */
export function cashFlowForecast(
  state: Pick<FinanceState, "transactions">,
  fromIso: string,
  horizonDays = 30,
): CashFlowForecast {
  const toDate = addDays(fromIso, horizonDays);
  const scheduled = scheduledRows(state, fromIso, toDate);
  const recurring = recurringOccurrences(state, fromIso, toDate, scheduled);

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

function salaryLike(row: Transaction) {
  if (
    row.status !== "posted" ||
    row.type !== "income" ||
    !countsInBudget(row)
  ) {
    return false;
  }
  if (row.category === "salario") return true;
  const text = normalize(`${row.merchant} ${row.description}`);
  return /\bsalario\b|\bremuneracao\b|\bfolha de pagamento\b|\bpagto salario\b/.test(text);
}

/**
 * Estima a próxima renda salarial sem criar lançamento. Primeiro respeita uma
 * entrada salarial já agendada; na ausência dela, projeta a data do último
 * recebimento um mês à frente e usa a média mensal observada.
 */
export function nextLikelySalary(
  state: Pick<FinanceState, "transactions">,
  fromIso: string,
): LikelySalary | null {
  const scheduled = state.transactions
    .filter(
      (row) =>
        row.status === "scheduled" &&
        row.type === "income" &&
        countsInBudget(row) &&
        row.date >= fromIso &&
        (row.category === "salario" ||
          /\bsalario\b|\bremuneracao\b/.test(normalize(`${row.merchant} ${row.description}`))),
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  if (scheduled) {
    return {
      date: scheduled.date,
      estimatedAmount: scheduled.amount,
      confidence: "confirmed",
      observedMonths: 0,
    };
  }

  const rows = state.transactions
    .filter((row) => salaryLike(row) && row.date < fromIso)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length === 0) return null;

  const byMonth = new Map<string, number>();
  for (const row of rows) {
    const month = row.date.slice(0, 7);
    byMonth.set(month, (byMonth.get(month) ?? 0) + row.amount);
  }
  const monthly = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-3);
  const estimatedAmount =
    monthly.reduce((sum, [, amount]) => sum + amount, 0) / Math.max(1, monthly.length);

  const last = rows[rows.length - 1];
  let date = addOneMonth(last.date);
  while (date < fromIso) date = addOneMonth(date);

  const observedMonths = byMonth.size;
  const confidence: LikelySalary["confidence"] =
    observedMonths >= 3 ? "high" : observedMonths === 2 ? "medium" : "low";

  return { date, estimatedAmount, confidence, observedMonths };
}
