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

function institutionFromHint(value: string) {
  const text = normalize(value);
  if (/\bnubank\b|\bnu pagamentos\b/.test(text)) return "Nubank";
  if (/\bitau\b/.test(text)) return "Itaú";
  if (/\bbradesco\b/.test(text)) return "Bradesco";
  if (/\bsantander\b/.test(text)) return "Santander";
  if (/\bbanco do brasil\b/.test(text)) return "Banco do Brasil";
  if (/\bcaixa economica\b|\bcaixa\b/.test(text)) return "Caixa";
  if (/\binter\b|\bbanco inter\b/.test(text)) return "Inter";
  if (/\bc6\b|\bc6 bank\b/.test(text)) return "C6";
  return undefined;
}

export function originFromDocument(
  summary: FinancialDocumentSummary | null,
  fileName: string | undefined,
  source: TxSource,
  documentText?: string,
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

  const hint = `${fileName ?? ""}\n${(documentText ?? "").slice(0, 12000)}`;
  const normalizedHint = normalize(hint);
  const institution = institutionFromHint(hint);
  const looksLikeCard =
    /\bfatura\b|\bcartao\b|\bcredit card\b/.test(normalizedHint) ||
    /(?:^|\s)fatura[_\- ]/.test(normalize(fileName ?? ""));
  const looksLikeAccount =
    /\bextrato\b|\bconta corrente\b|\bsaldo em conta\b|\blancamentos conta\b/.test(normalizedHint);

  if (institution && looksLikeCard) {
    return {
      originLabel: `Cartão ${institution}`,
      originInstitution: institution,
      originKind: "credit_card",
      sourceFileName: fileName,
    };
  }

  if (institution && (looksLikeAccount || source === "sheet")) {
    return {
      originLabel: `Conta ${institution}`,
      originInstitution: institution,
      originKind: "bank_account",
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
