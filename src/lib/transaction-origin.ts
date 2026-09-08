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

function strongCardEvidence(fileName: string | undefined, documentText: string | undefined) {
  const file = normalize(fileName ?? "");
  const text = normalize((documentText ?? "").slice(0, 16000));

  const explicitFile = /\bfatura\b|\binvoice\b/.test(file);
  const explicitContent =
    /\bpagamento total da fatura\b/.test(text) ||
    /\btotal desta fatura\b/.test(text) ||
    /\bvalor total da fatura\b/.test(text) ||
    /\bresumo da fatura\b/.test(text) ||
    /\bfatura atual\b/.test(text) ||
    (/\bfatura\b/.test(text) && /\bvencimento\b/.test(text) && /\blimite\b/.test(text));

  return explicitFile || explicitContent;
}

function strongAccountEvidence(documentText: string | undefined) {
  const text = normalize((documentText ?? "").slice(0, 16000));
  return (
    /\bextrato\b/.test(text) ||
    /\bconta corrente\b/.test(text) ||
    /\bsaldo em conta\b/.test(text) ||
    /\bsaldo do dia\b/.test(text) ||
    /\blancamentos da conta\b/.test(text) ||
    /\baplicacao rdb\b/.test(text) ||
    /\bresgate rdb\b/.test(text)
  );
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

  const hint = `${fileName ?? ""}\n${(documentText ?? "").slice(0, 16000)}`;
  const institution = institutionFromHint(hint);
  const isCard = strongCardEvidence(fileName, documentText);
  const isAccount = strongAccountEvidence(documentText);

  // CSV/Excel bancário é tratado como conta por padrão. A simples menção a
  // "cartão" dentro de um lançamento (ex.: pagamento de fatura ou Pix no crédito)
  // não pode transformar o extrato inteiro em fatura de cartão.
  if (institution && source === "sheet" && !isCard) {
    return {
      originLabel: `Conta ${institution}`,
      originInstitution: institution,
      originKind: "bank_account",
      sourceFileName: fileName,
    };
  }

  // Em PDFs, sinais de extrato prevalecem sobre menções soltas a cartão.
  if (institution && isAccount && !isCard) {
    return {
      originLabel: `Conta ${institution}`,
      originInstitution: institution,
      originKind: "bank_account",
      sourceFileName: fileName,
    };
  }

  if (institution && isCard) {
    return {
      originLabel: `Cartão ${institution}`,
      originInstitution: institution,
      originKind: "credit_card",
      sourceFileName: fileName,
    };
  }

  if (institution && isAccount) {
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
