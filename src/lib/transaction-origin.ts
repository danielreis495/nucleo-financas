import type { ExtractedItem, FinancialDocumentSummary, TxOriginKind, TxSource } from "./types";

export type ImportOrigin = {
  originLabel: string;
  originInstitution?: string;
  originKind: TxOriginKind;
  sourceFileName?: string;
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

export function originFromDocument(
  summary: FinancialDocumentSummary | null,
  fileName: string | undefined,
  source: TxSource,
): ImportOrigin {
  if (summary?.kind === "credit_card_bill") {
    return {
      originLabel: `Cartão ${summary.institution}`,
      originInstitution: summary.institution,
      originKind: "credit_card",
      sourceFileName: fileName,
    };
  }

  if (summary?.kind === "bank_statement") {
    return {
      originLabel: `Conta ${summary.institution}`,
      originInstitution: summary.institution,
      originKind: "bank_account",
      sourceFileName: fileName,
    };
  }

  if (source === "manual") {
    return {
      originLabel: "Lançamento manual",
      originKind: "manual",
      sourceFileName: fileName,
    };
  }

  const sourceLabel = source === "sheet" ? "Planilha importada" : source === "pdf" ? "PDF importado" : "Foto importada";
  return {
    originLabel: sourceLabel,
    originKind: "unknown",
    sourceFileName: fileName,
  };
}

export function paymentMethodForItem(item: Pick<ExtractedItem, "merchant" | "description" | "type" | "nature">, origin: ImportOrigin) {
  if (origin.originKind === "credit_card") return "Crédito";
  if (origin.originKind === "manual") return "Manual";

  const text = normalize(`${item.merchant} ${item.description}`);
  if (/\bpix\b/.test(text)) return "Pix";
  if (/\bboleto\b/.test(text)) return "Boleto";
  if (/\bted\b|\btransferencia\b|\btransf\b/.test(text)) return "Transferência";
  if (/\b(aplicacao|resgate|rdb|cofrinho|investimento)\b/.test(text)) return "Investimento";
  if (/\bsalario\b|\bremuneracao\b/.test(text)) return "Crédito em conta";
  if (/\biof\b|\bjuros\b|\btarifa\b|\bseguro\b/.test(text)) return "Débito em conta";

  if (origin.originKind === "bank_account") {
    return item.type === "income" ? "Crédito em conta" : "Débito em conta";
  }

  return item.type === "income" ? "Crédito" : "Débito";
}
