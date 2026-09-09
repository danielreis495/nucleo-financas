import { countsInBudget } from "./movement-nature";
import type { FinanceState, Transaction } from "./types";

export type RecurringExpense = {
  key: string;
  merchant: string;
  averageAmount: number;
  occurrences: number;
  lastDate: string;
  nextDate: string;
  confidence: "high" | "medium";
};

function normalizeMerchant(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function monthIndex(date: string) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return year * 12 + month;
}

function addOneMonth(date: string) {
  const d = new Date(`${date}T12:00:00`);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getDate();
  d.setDate(Math.min(day, lastDay));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function amountVariation(rows: Transaction[]) {
  const values = rows.map((row) => row.amount);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (avg <= 0) return { avg: 0, ratio: 1 };
  const maxDeviation = Math.max(...values.map((value) => Math.abs(value - avg)));
  return { avg, ratio: maxDeviation / avg };
}

function monthlyEnough(rows: Transaction[]) {
  const monthIds = [...new Set(rows.map((row) => monthIndex(row.date)))].sort((a, b) => a - b);
  if (monthIds.length < 2) return false;
  const recent = monthIds.slice(-4);
  const gaps = recent.slice(1).map((value, index) => value - recent[index]);
  return gaps.every((gap) => gap >= 1 && gap <= 2);
}

function eligible(row: Transaction) {
  if (row.status !== "posted" || row.type !== "expense" || !countsInBudget(row)) return false;
  if (row.installmentId) return false;
  const merchant = normalizeMerchant(row.merchant);
  if (!merchant || merchant === "lancamento" || merchant === "gasto rapido") return false;
  if (/favorecido nao identificado/.test(merchant)) return false;
  return true;
}

/**
 * Detecta recorrências sem criar lançamentos ou alterar dados persistidos.
 * Exige repetição mensal/bimestral curta e valores razoavelmente estáveis.
 */
export function recurringExpenses(state: Pick<FinanceState, "transactions">, limit = 8): RecurringExpense[] {
  const groups = new Map<string, Transaction[]>();
  for (const row of state.transactions) {
    if (!eligible(row)) continue;
    const key = normalizeMerchant(row.merchant);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const result: RecurringExpense[] = [];
  for (const [key, raw] of groups) {
    const rows = [...raw].sort((a, b) => a.date.localeCompare(b.date));
    const distinctMonths = new Set(rows.map((row) => row.date.slice(0, 7))).size;
    if (distinctMonths < 2 || !monthlyEnough(rows)) continue;

    const recent = rows.slice(-4);
    const { avg, ratio } = amountVariation(recent);
    // Assinaturas fixas tendem a ser estáveis; contas recorrentes podem variar um pouco.
    if (ratio > 0.25 && Math.max(...recent.map((row) => row.amount)) - Math.min(...recent.map((row) => row.amount)) > 15) {
      continue;
    }

    const last = rows[rows.length - 1];
    result.push({
      key,
      merchant: last.merchant,
      averageAmount: avg,
      occurrences: distinctMonths,
      lastDate: last.date,
      nextDate: addOneMonth(last.date),
      confidence: distinctMonths >= 3 ? "high" : "medium",
    });
  }

  return result
    .sort((a, b) => {
      if (a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1;
      return b.averageAmount - a.averageAmount;
    })
    .slice(0, limit);
}

export function recurringMonthlyTotal(rows: RecurringExpense[]) {
  return rows.reduce((sum, row) => sum + row.averageAmount, 0);
}
