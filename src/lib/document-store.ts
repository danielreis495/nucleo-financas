import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { FinancialDocumentSummary } from "./types";
import { uid } from "./utils";

type DocumentState = {
  summaries: FinancialDocumentSummary[];
  addSummary: (summary: FinancialDocumentSummary | null) => void;
  clearSummaries: () => void;
};

function normalizeKeyPart(value: string | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function summaryKey(summary: FinancialDocumentSummary) {
  if (summary.kind === "bank_statement") {
    return [
      summary.kind,
      normalizeKeyPart(summary.institution),
      normalizeKeyPart(summary.holderName),
      summary.balanceDate ?? summary.referenceMonth,
    ].join("|");
  }

  // A mesma fatura pode ser relida com pequenas diferenças de vencimento/extração.
  // Para atualização de uma fatura já conhecida, a identidade estável é
  // instituição + titular + mês de referência, e a versão mais recente substitui a anterior.
  return [
    summary.kind,
    normalizeKeyPart(summary.institution),
    normalizeKeyPart(summary.holderName),
    summary.referenceMonth,
  ].join("|");
}

export const useDocumentStore = create<DocumentState>()(
  persist(
    (set, get) => ({
      summaries: [],
      addSummary: (summary) => {
        if (!summary) return;
        const prepared: FinancialDocumentSummary = {
          ...summary,
          id: summary.id || uid(),
          importedAt: summary.importedAt || new Date().toISOString(),
        };
        const key = summaryKey(prepared);
        const filtered = get().summaries.filter((item) => summaryKey(item) !== key);
        set({ summaries: [prepared, ...filtered].slice(0, 120) });
      },
      clearSummaries: () => set({ summaries: [] }),
    }),
    { name: "nucleo-documents-v1" },
  ),
);
