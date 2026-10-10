/**
 * Saldos de conta e faturas de cartão vindos do Open Finance, no mesmo formato dos
 * documentos importados (PDF), para o "Caixa real" e a visão rápida da tela inicial.
 * Fica em memória: é preenchido a cada leitura dos dados do banco.
 */
import type { FinancialDocumentSummary } from "../types";

let current: FinancialDocumentSummary[] = [];

export function setBankSummaries(summaries: FinancialDocumentSummary[]) {
  current = summaries;
}

export function bankSummaries() {
  return current;
}
