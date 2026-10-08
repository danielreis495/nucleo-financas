import { create } from "zustand";
import { persist } from "zustand/middleware";
import { billIdentityKey, sameCardBill } from "./bill-identity";
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

  return ["bill", billIdentityKey(summary)].join("|");
}

function dedupeSummaries(items: FinancialDocumentSummary[]) {
  const sorted = [...items].sort((a, b) =>
    (b.importedAt ?? "").localeCompare(a.importedAt ?? ""),
  );
  const seen = new Set<string>();
  const bills: FinancialDocumentSummary[] = [];
  const result: FinancialDocumentSummary[] = [];
  for (const item of sorted) {
    if (item.kind === "credit_card_bill") {
      // Faturas de titulares diferentes no mesmo banco/mês continuam separadas.
      if (bills.some((kept) => sameCardBill(kept, item))) continue;
      bills.push(item);
      result.push(item);
      continue;
    }
    const key = summaryKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result.slice(0, 120);
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
        set({ summaries: dedupeSummaries([prepared, ...get().summaries]) });
      },
      clearSummaries: () => set({ summaries: [] }),
    }),
    {
      name: "nucleo-documents-v1",
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<DocumentState>;
        return {
          ...current,
          ...saved,
          summaries: dedupeSummaries(Array.isArray(saved.summaries) ? saved.summaries : []),
        };
      },
    },
  ),
);
