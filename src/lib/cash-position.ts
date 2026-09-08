import type { FinancialDocumentSummary } from "./types";

function monthEnd(key: string) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month, 0, 12, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeKeyPart(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function summaryAccountKey(summary: FinancialDocumentSummary) {
  return `${normalizeKeyPart(summary.institution)}|${normalizeKeyPart(summary.holderName)}`;
}

function billIdentityKey(summary: FinancialDocumentSummary) {
  return [
    normalizeKeyPart(summary.institution),
    summary.referenceMonth,
  ].join("|");
}

export type CashPosition = {
  cashKnown: boolean;
  cashBalance: number;
  cashSources: number;
  billsKnown: boolean;
  billsDue: number;
  billCount: number;
  netAvailable: number | null;
};

export function cashPositionForMonth(
  summaries: FinancialDocumentSummary[],
  month: string,
): CashPosition {
  const end = monthEnd(month);
  const statements = summaries
    .filter(
      (summary) =>
        summary.kind === "bank_statement" &&
        typeof summary.balance === "number" &&
        Boolean(summary.balanceDate) &&
        summary.balanceDate! <= end,
    )
    .sort((a, b) => (b.balanceDate ?? "").localeCompare(a.balanceDate ?? ""));

  const latestByAccount = new Map<string, FinancialDocumentSummary>();
  for (const summary of statements) {
    const key = summaryAccountKey(summary);
    if (!latestByAccount.has(key)) latestByAccount.set(key, summary);
  }

  const selectedStatements = [...latestByAccount.values()].filter((summary) => {
    const date = summary.balanceDate ?? "";
    return date.slice(0, 7) === month || summary.referenceMonth === month;
  });
  const cashBalance = selectedStatements.reduce((sum, summary) => sum + (summary.balance ?? 0), 0);

  const bills = summaries
    .filter(
      (summary) =>
        summary.kind === "credit_card_bill" &&
        summary.referenceMonth === month &&
        typeof summary.billTotal === "number" &&
        summary.billTotal! > 0,
    )
    .sort((a, b) => (b.importedAt ?? "").localeCompare(a.importedAt ?? ""));

  // Titular não participa da identidade porque PDFs diferentes podem trazer o nome
  // completo, abreviado ou nenhum titular. Para cada instituição/mês vale somente a
  // leitura mais recente da fatura.
  const billMap = new Map<string, FinancialDocumentSummary>();
  for (const bill of bills) {
    const key = billIdentityKey(bill);
    if (!billMap.has(key)) billMap.set(key, bill);
  }
  const uniqueBills = [...billMap.values()];
  const billsDue = uniqueBills.reduce((sum, bill) => sum + (bill.billTotal ?? 0), 0);

  const cashKnown = selectedStatements.length > 0;
  const billsKnown = uniqueBills.length > 0;
  return {
    cashKnown,
    cashBalance,
    cashSources: selectedStatements.length,
    billsKnown,
    billsDue,
    billCount: uniqueBills.length,
    netAvailable: cashKnown ? cashBalance - billsDue : null,
  };
}
