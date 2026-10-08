import type { FinancialDocumentSummary } from "./types";

export function normalizeKeyPart(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalInstitution(value: string | undefined) {
  const text = normalizeKeyPart(value);
  if (/\bnubank\b|\bnu pagamentos\b/.test(text)) return "nubank";
  if (/\bitau\b/.test(text)) return "itau";
  if (/\bbradesco\b/.test(text)) return "bradesco";
  if (/\bsantander\b/.test(text)) return "santander";
  if (/\bbanco do brasil\b/.test(text)) return "banco do brasil";
  if (/\bcaixa economica\b|\bcaixa\b/.test(text)) return "caixa";
  if (/\bbanco inter\b|\binter\b/.test(text)) return "inter";
  if (/\bc6 bank\b|\bc6\b/.test(text)) return "c6";
  return text;
}

/**
 * Duas leituras são a mesma fatura quando instituição e mês batem e os
 * titulares não se contradizem. Se os dois titulares foram lidos e são
 * diferentes (ex.: cartões do casal no mesmo banco), são faturas distintas.
 * Sem titular em uma das leituras, mantemos o comportamento antigo (mesma
 * fatura) para não contar duas vezes um documento reimportado.
 */
export function sameCardBill(a: FinancialDocumentSummary, b: FinancialDocumentSummary) {
  if (a.kind !== "credit_card_bill" || b.kind !== "credit_card_bill") return false;
  if (canonicalInstitution(a.institution) !== canonicalInstitution(b.institution)) return false;
  if (a.referenceMonth !== b.referenceMonth) return false;
  const holderA = normalizeKeyPart(a.holderName);
  const holderB = normalizeKeyPart(b.holderName);
  return !holderA || !holderB || holderA === holderB;
}

/** Chave estável de uma fatura (inclui o titular quando conhecido). */
export function billIdentityKey(summary: FinancialDocumentSummary) {
  return [
    canonicalInstitution(summary.institution),
    summary.referenceMonth,
    normalizeKeyPart(summary.holderName),
  ].join("|");
}

/** Mantém a leitura mais recente de cada fatura, sem juntar faturas de titulares diferentes. */
export function uniqueCardBills(bills: FinancialDocumentSummary[]) {
  const sorted = [...bills].sort((a, b) => (b.importedAt ?? "").localeCompare(a.importedAt ?? ""));
  const result: FinancialDocumentSummary[] = [];
  for (const bill of sorted) {
    if (result.some((kept) => sameCardBill(kept, bill))) continue;
    result.push(bill);
  }
  return result;
}
