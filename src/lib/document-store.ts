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

  // Para fatura mensal, titular pode variar entre leituras (ou faltar no PDF extraído).
  // A identidade estável é instituição + mês de referência.
  return [
    summary.kind,
    normalizeKeyPart(summary.institution),
    summary.referenceMonth,
  ].join("|");
}

function dedupeSummaries(items: FinancialDocumentSummary[]) {
  const sorted = [...items].sort((a, b) =>
    (b.importedAt ?? "").localeCompare(a.importedAt ?? ""),
  );
  const seen = new Set<string>();
  const result: FinancialDocumentSummary[] = [];
  for (const item of sorted) {
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
      // v1 guardava resumos criados por versões antigas do parser e pode conter
      // totais incorretos de fatura. v2 começa limpa sem apagar os lançamentos.
      name: "nucleo-documents-v2",
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
