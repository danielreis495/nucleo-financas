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

function nubankStatementFile(fileName: string | undefined) {
  const file = normalize(fileName ?? "");
  return /^nu \d+ \d{2}(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\d{4} \d{2}(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\d{4} pdf$/.test(file);
}

function evidenceScores(
  summary: FinancialDocumentSummary | null,
  fileName: string | undefined,
  source: TxSource,
  documentText?: string,
) {
  const file = normalize(fileName ?? "");
  const text = normalize((documentText ?? "").slice(0, 20000));
  let account = 0;
  let card = 0;

  if (nubankStatementFile(fileName)) account += 12;
  if (/\bextrato\b|\bstatement\b/.test(file)) account += 6;
  if (/\bfatura\b|\binvoice\b/.test(file)) card += 8;
  if (source === "sheet" && !/\bfatura\b|\binvoice\b/.test(file)) account += 1;

  if (/\btransferencia enviada pix\b|\btransferencia recebida pix\b/.test(text)) account += 6;
  if (/\bextrato da conta\b|\bextrato conta\b|\bextrato bancario\b/.test(text)) account += 6;
  if (/\bsaldo em conta\b|\bsaldo da conta\b|\bsaldo do dia\b/.test(text)) account += 4;
  if (/\baplicacao rdb\b|\bresgate rdb\b|\baplicacao cofrinho\b|\bresgate cofrinho\b/.test(text)) account += 4;
  if (/\bcompra no debito\b|\bdebito em conta\b/.test(text)) account += 2;

  if (/\besta e a sua fatura\b/.test(text)) card += 7;
  if (/\bresumo da fatura atual\b|\bresumo da fatura\b/.test(text)) card += 6;
  if (/\bpagamento total da fatura\b/.test(text)) card += 5;
  if (/\btotal desta fatura\b|\bvalor total da fatura\b/.test(text)) card += 5;
  if (/\bfatura\b.{0,80}\bemissao e envio\b/.test(text)) card += 4;
  if (/\blimite total do cartao de credito\b/.test(text)) card += 4;
  if (/\bdata de vencimento\b/.test(text) && /\bfatura\b/.test(text)) card += 3;

  // O resumo é um sinal auxiliar, não uma verdade absoluta. Extratos podem conter
  // palavras como “fatura” e “cartão” em lançamentos individuais.
  if (summary?.kind === "bank_statement") account += 3;
  if (summary?.kind === "credit_card_bill") card += 3;

  return { account, card };
}

function chooseOriginKind(
  summary: FinancialDocumentSummary | null,
  fileName: string | undefined,
  source: TxSource,
  documentText?: string,
): TxOriginKind {
  if (source === "manual") return "manual";
  const scores = evidenceScores(summary, fileName, source, documentText);
  if (scores.account > scores.card) return "bank_account";
  if (scores.card > scores.account) return "credit_card";
  if (summary?.kind === "bank_statement") return "bank_account";
  if (summary?.kind === "credit_card_bill") return "credit_card";
  return "unknown";
}

export function originFromDocument(
  summary: FinancialDocumentSummary | null,
  fileName: string | undefined,
  source: TxSource,
  documentText?: string,
): ImportOrigin {
  const hint = `${fileName ?? ""}\n${(documentText ?? "").slice(0, 20000)}`;
  const summaryInstitution = summary?.institution && summary.institution !== "Instituição não identificada"
    ? summary.institution
    : undefined;
  const institution = summaryInstitution ?? institutionFromHint(hint);
  const kind = chooseOriginKind(summary, fileName, source, documentText);

  if (kind === "manual") {
    return {
      originLabel: "Lançamento manual",
      originKind: "manual",
      sourceFileName: fileName,
    };
  }

  if (institution && kind === "bank_account") {
    return {
      originLabel: `Conta ${institution}`,
      originInstitution: institution,
      originKind: "bank_account",
      sourceFileName: fileName,
    };
  }

  if (institution && kind === "credit_card") {
    return {
      originLabel: `Cartão ${institution}`,
      originInstitution: institution,
      originKind: "credit_card",
      sourceFileName: fileName,
    };
  }

  const sourceLabel = source === "sheet" ? "Planilha importada" : source === "pdf" ? "PDF importado" : "Foto importada";
  return {
    originLabel: sourceLabel,
    originInstitution: institution,
    originKind: "unknown",
    sourceFileName: fileName,
  };
}

export function paymentMethodForItem(
  item: Pick<ExtractedItem, "merchant" | "description" | "type" | "nature">,
  origin: ImportOrigin,
) {
  const text = normalize(`${item.merchant} ${item.description}`);

  // A natureza do lançamento prevalece sobre a origem do documento. Uma
  // transferência continua sendo transferência mesmo se um arquivo tiver sido
  // identificado incorretamente como cartão.
  if (item.nature === "transfer") return "Transferência";
  if (item.nature === "investment") return "Investimento";
  if (item.nature === "card_payment") return "Pagamento de fatura";
  if (item.nature === "financing") return "Crédito / financiamento";
  if (item.nature === "neutral") return "Movimento neutro";

  if (/\bpix\b/.test(text)) return "Pix";
  if (/\bboleto\b/.test(text)) return "Boleto";
  if (/\bted\b|\btransferencia\b|\btransf\b/.test(text)) return "Transferência";
  if (/\b(aplicacao|resgate|rdb|cofrinho|investimento)\b/.test(text)) return "Investimento";
  if (/\bsalario\b|\bremuneracao\b/.test(text)) return "Crédito em conta";
  if (/\biof\b|\bjuros\b|\btarifa\b|\bseguro\b/.test(text)) return "Débito em conta";

  if (origin.originKind === "credit_card") return "Crédito";
  if (origin.originKind === "manual") return "Manual";
  if (origin.originKind === "bank_account") {
    return item.type === "income" ? "Crédito em conta" : "Débito em conta";
  }

  return item.type === "income" ? "Crédito" : "Débito";
}
