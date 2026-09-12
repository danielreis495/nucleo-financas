import { cashPositionForMonth } from "./cash-position";
import { categoryLabel } from "./categories";
import { cashFlowForecast } from "./forecast";
import { countsInBudget } from "./movement-nature";
import { budgetUsage, monthTransactions, spendByCategory } from "./selectors";
import type { FinanceState, FinancialDocumentSummary, Transaction } from "./types";
import { addMonthsKey, todayIso } from "./utils";

export type FinancialAlertSeverity = "high" | "medium" | "info";
export type FinancialAlertKind =
  | "cash"
  | "bill"
  | "spending"
  | "budget"
  | "forecast"
  | "quality"
  | "duplicate";

export type FinancialAlert = {
  id: string;
  kind: FinancialAlertKind;
  severity: FinancialAlertSeverity;
  title: string;
  body: string;
};

function normalize(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

export function exactDuplicateGroups(rows: Transaction[]) {
  const groups = new Map<string, Transaction[]>();
  for (const row of rows) {
    if (!row.sourceFileName || row.status !== "posted") continue;
    const key = [
      normalize(row.sourceFileName),
      row.date,
      row.amount.toFixed(2),
      row.type,
      row.nature ?? "budget",
      normalize(row.merchant),
      normalize(row.description),
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function exactDuplicateTransactionIds(rows: Transaction[]) {
  return new Set(exactDuplicateGroups(rows).flatMap((group) => group.map((row) => row.id)));
}

export function unidentifiedTransactionIds(rows: Transaction[]) {
  return new Set(
    rows
      .filter(
        (row) =>
          row.source !== "manual" &&
          countsInBudget(row) &&
          (/favorecido nao identificado/.test(normalize(row.merchant)) || !row.originLabel),
      )
      .map((row) => row.id),
  );
}

function dueLabel(date: string | undefined) {
  if (!date) return "sem vencimento identificado";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" })
    .format(new Date(date + "T12:00:00"));
}

export function financialAlerts(
  state: FinanceState,
  summaries: FinancialDocumentSummary[],
  month: string,
): FinancialAlert[] {
  const alerts: FinancialAlert[] = [];
  const cash = cashPositionForMonth(summaries, month, state.transactions);
  const today = todayIso();
  const currentMonth = today.slice(0, 7);
  const currentRows = monthTransactions(state, month, false, true);

  if (cash.netAvailable !== null && cash.netAvailable < 0) {
    alerts.push({
      id: "cash-negative",
      kind: "cash",
      severity: "high",
      title: "Caixa descoberto",
      body: `Depois das faturas realmente abertas, faltam ${formatMoney(Math.abs(cash.netAvailable))} para o caixa identificado fechar.`,
    });
  }

  for (const bill of cash.billRows.filter((row) => row.status === "open")) {
    alerts.push({
      id: `bill-open-${normalize(bill.institution)}-${bill.referenceMonth}`,
      kind: "bill",
      severity: "high",
      title: `${bill.institution} ainda em aberto`,
      body: `${formatMoney(bill.total)} com vencimento em ${dueLabel(bill.dueDate)} ainda não foi reconciliado com um pagamento.`,
    });
  }

  if (month === currentMonth && cash.cashKnown) {
    const forecast = cashFlowForecast(state, today, 30);
    const resources = Math.max(0, cash.cashBalance) + Math.max(0, forecast.expectedIncome);
    if (forecast.expectedOutflow > resources + 50) {
      alerts.push({
        id: "forecast-gap-30",
        kind: "forecast",
        severity: "high",
        title: "Próximos 30 dias apertados",
        body: `Há cerca de ${formatMoney(forecast.expectedOutflow)} em saídas previstas contra ${formatMoney(resources)} de caixa e entradas já confirmadas.`,
      });
    }
  }

  const budgets = budgetUsage(state, month).filter((item) => item.monthlyLimit > 0 && item.ratio > 1);
  if (budgets.length > 0) {
    const worst = budgets[0];
    alerts.push({
      id: `budget-${worst.category}`,
      kind: "budget",
      severity: worst.ratio >= 1.25 ? "high" : "medium",
      title: `${categoryLabel(worst.category, state.customCategories)} acima do teto`,
      body: `O mês já consumiu ${formatMoney(worst.used)} de um limite de ${formatMoney(worst.monthlyLimit)}.`,
    });
  }

  const currentCategories = spendByCategory(monthTransactions(state, month));
  const previousMonth = addMonthsKey(month, -1);
  const previousCategories = new Map(
    spendByCategory(monthTransactions(state, previousMonth)).map((row) => [row.category, row.amount]),
  );
  const growth = currentCategories
    .map((row) => {
      const before = previousCategories.get(row.category) ?? 0;
      const increase = row.amount - before;
      const ratio = before > 0 ? row.amount / before : 0;
      return { ...row, before, increase, ratio };
    })
    .filter((row) => row.before >= 50 && row.increase >= 100 && row.ratio >= 1.3)
    .sort((a, b) => b.increase - a.increase)[0];

  if (growth) {
    alerts.push({
      id: `spike-${growth.category}`,
      kind: "spending",
      severity: growth.ratio >= 1.7 ? "high" : "medium",
      title: `${categoryLabel(growth.category, state.customCategories)} acelerou`,
      body: `Está ${formatMoney(growth.increase)} acima do mês anterior (${formatMoney(growth.before)} → ${formatMoney(growth.amount)}).`,
    });
  }

  const monthExpense = currentCategories.reduce((sum, row) => sum + row.amount, 0);
  const other = currentCategories.find((row) => row.category === "outros");
  if (other && other.amount >= 150 && (monthExpense <= 0 || other.amount / monthExpense >= 0.1)) {
    alerts.push({
      id: "quality-others",
      kind: "quality",
      severity: "medium",
      title: "Muita coisa ainda está em Outros",
      body: `${formatMoney(other.amount)} do mês ainda está numa categoria genérica. Revisar isso melhora os alertas e previsões.`,
    });
  }

  const unidentified = currentRows.filter(
    (row) =>
      row.source !== "manual" &&
      countsInBudget(row) &&
      (/favorecido nao identificado/.test(normalize(row.merchant)) || !row.originLabel),
  );
  if (unidentified.length >= 2) {
    alerts.push({
      id: "quality-unidentified",
      kind: "quality",
      severity: "medium",
      title: "Há lançamentos para revisar",
      body: `${unidentified.length} lançamentos importados ainda têm favorecido ou origem incompletos.`,
    });
  }

  const duplicateGroups = exactDuplicateGroups(currentRows);
  if (duplicateGroups.length > 0) {
    const count = duplicateGroups.reduce((sum, group) => sum + group.length - 1, 0);
    alerts.push({
      id: "exact-duplicates",
      kind: "duplicate",
      severity: "high",
      title: "Possível duplicidade exata",
      body: `Encontrei ${count} lançamento${count === 1 ? "" : "s"} repetido${count === 1 ? "" : "s"} no mesmo arquivo, com data, valor e descrição idênticos.`,
    });
  }

  const rank: Record<FinancialAlertSeverity, number> = { high: 0, medium: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 10);
}
