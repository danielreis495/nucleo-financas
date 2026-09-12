import { countsInBudget, isExpenseRefund } from "./movement-nature";
import { recurringExpenses } from "./recurring";
import type { FinanceState, Transaction } from "./types";

export type ForecastItem = {
  key: string;
  date: string;
  label: string;
  amount: number;
  type: "expense" | "income";
  source: "scheduled" | "recurring" | "planned_income";
  confidence: "confirmed" | "high" | "medium";
};

export type CashFlowForecast = {
  fromDate: string;
  toDate: string;
  scheduledExpenses: number;
  scheduledIncome: number;
  plannedIncome: number;
  expectedIncome: number;
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

export type MonthlyIncomeForecast = {
  month: string;
  received: number;
  salaryExpected: number;
  manualPlanned: number;
  expectedTotal: number;
  salaryConfidence: "confirmed" | "high" | "medium" | "low" | "none";
  observedSalaryMonths: number;
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
  state: Pick<FinanceState, "transactions" | "plannedIncomes">,
  fromIso: string,
  horizonDays = 30,
): CashFlowForecast {
  const toDate = addDays(fromIso, horizonDays);
  const scheduled = scheduledRows(state, fromIso, toDate);
  const recurring = recurringOccurrences(state, fromIso, toDate, scheduled);
  const plannedIncomeRows = (state.plannedIncomes ?? []).filter(
    (item) => !item.fulfilled && item.date >= fromIso && item.date <= toDate,
  );

  const scheduledExpenses = scheduled
    .filter((row) => row.type === "expense")
    .reduce((sum, row) => sum + row.amount, 0);
  const scheduledIncome = scheduled
    .filter((row) => row.type === "income")
    .reduce((sum, row) => sum + row.amount, 0);
  const plannedIncome = plannedIncomeRows.reduce((sum, row) => sum + row.amount, 0);
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

  const plannedIncomeItems: ForecastItem[] = plannedIncomeRows.map((row) => ({
    key: `planned-income:${row.id}`,
    date: row.date,
    label: row.label,
    amount: row.amount,
    type: "income",
    source: "planned_income",
    confidence: "medium",
  }));

  const items = [...scheduledItems, ...recurringItems, ...plannedIncomeItems].sort(
    (a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, "pt-BR"),
  );
  const expectedOutflow = scheduledExpenses + predictedRecurring;
  const expectedIncome = scheduledIncome + plannedIncome;

  return {
    fromDate: fromIso,
    toDate,
    scheduledExpenses,
    scheduledIncome,
    plannedIncome,
    expectedIncome,
    predictedRecurring,
    expectedOutflow,
    expectedNet: expectedIncome - expectedOutflow,
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


function realBudgetIncome(row: Transaction) {
  return (
    row.type === "income" &&
    countsInBudget(row) &&
    row.originKind !== "credit_card" &&
    !isExpenseRefund(row)
  );
}

/**
 * Previsão de entradas do mês com uma regra conservadora:
 * - entradas realizadas vêm do extrato;
 * - apenas salário/remuneração pode ser projetado automaticamente;
 * - qualquer outra entrada futura precisa ser cadastrada pelo usuário.
 * Entradas previstas concluídas não entram novamente na projeção.
 */
export function monthlyIncomeForecast(
  state: Pick<FinanceState, "transactions" | "plannedIncomes">,
  targetMonth: string,
): MonthlyIncomeForecast {
  const current = state.transactions.filter(
    (row) => realBudgetIncome(row) && row.date.slice(0, 7) === targetMonth,
  );
  const received = current
    .filter((row) => row.status === "posted")
    .reduce((sum, row) => sum + row.amount, 0);

  const salaryReceived = current
    .filter((row) => row.status === "posted" && salaryLike(row))
    .reduce((sum, row) => sum + row.amount, 0);
  const scheduledSalary = current
    .filter(
      (row) =>
        row.status === "scheduled" &&
        row.type === "income" &&
        countsInBudget(row) &&
        (row.category === "salario" ||
          /\bsalario\b|\bremuneracao\b/.test(normalize(`${row.merchant} ${row.description}`))),
    )
    .reduce((sum, row) => sum + row.amount, 0);

  const targetStart = `${targetMonth}-01`;
  const likelySalary = nextLikelySalary(state, targetStart);
  const inferredSalary =
    salaryReceived > 0 || scheduledSalary > 0
      ? 0
      : likelySalary && likelySalary.date.slice(0, 7) === targetMonth
        ? likelySalary.estimatedAmount
        : 0;

  const planned = (state.plannedIncomes ?? []).filter(
    (item) => !item.fulfilled && item.date.slice(0, 7) === targetMonth,
  );
  const manualPlanned = planned.reduce((sum, item) => sum + item.amount, 0);
  const salaryExpected = scheduledSalary + inferredSalary;

  return {
    month: targetMonth,
    received,
    salaryExpected,
    manualPlanned,
    expectedTotal: received + salaryExpected + manualPlanned,
    salaryConfidence:
      scheduledSalary > 0
        ? "confirmed"
        : inferredSalary > 0 && likelySalary
          ? likelySalary.confidence
          : "none",
    observedSalaryMonths: inferredSalary > 0 && likelySalary ? likelySalary.observedMonths : 0,
  };
}

