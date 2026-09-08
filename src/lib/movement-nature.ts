import { applyMerchantAlias } from "./merchant-aliases";
import type { ExtractedItem, Transaction, TxNature } from "./types";

export const NATURE_LABEL: Record<TxNature, string> = {
  budget: "Orçamento",
  transfer: "Transferência",
  investment: "Investimento / resgate",
  card_payment: "Pagamento de fatura",
  financing: "Crédito / financiamento",
  neutral: "Fora do orçamento",
};

type MovementLike = {
  merchant: string;
  description: string;
  amount: number;
  date: string;
  type: "expense" | "income";
  nature?: TxNature;
  natureLocked?: boolean;
  accountId?: string | null;
  originKind?: "credit_card" | "bank_account" | "manual" | "unknown";
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

function textOf(row: Pick<MovementLike, "merchant" | "description">) {
  return normalize(`${row.merchant} ${row.description}`);
}

export function natureOf(row: { nature?: TxNature }) {
  return row.nature ?? "budget";
}

export function countsInBudget(row: { nature?: TxNature }) {
  return natureOf(row) === "budget";
}

export function isExpenseRefund(
  row: Pick<MovementLike, "merchant" | "description" | "type" | "nature" | "originKind">,
) {
  if (natureOf(row) !== "budget" || row.type !== "income") return false;

  // Em fatura de cartão, um lançamento positivo para o cliente (type=income)
  // é crédito/estorno que reduz a despesa. Pagamentos da fatura são ignorados
  // na extração e, quando aparecem em extrato de conta, usam card_payment.
  if (row.originKind === "credit_card") return true;

  const text = textOf(row);
  return (
    /\bestorno\b/.test(text) ||
    /\breembolso\b/.test(text) ||
    /\bcashback\b/.test(text) ||
    /\bdevolucao\b/.test(text) ||
    /\bcredito (?:de|da) compra\b/.test(text) ||
    /\bcredito (?:na|da) fatura\b/.test(text) ||
    /\bajuste a credito\b/.test(text) ||
    /\bcompra cancelada\b/.test(text)
  );
}

export function inferMovementNature(row: MovementLike): TxNature {
  if (row.natureLocked) return row.nature ?? "budget";
  if (row.nature && row.nature !== "budget") return row.nature;
  const text = textOf(row);

  if (
    /\b(aplicacao|aplicar|resgate|resgatado)\b.*\b(rdb|cofrinho|cofrinhos|investimento|investimentos)\b/.test(text) ||
    /\b(rdb|cofrinho|cofrinhos)\b.*\b(aplicacao|resgate)\b/.test(text)
  ) {
    return "investment";
  }

  if (
    /\bpagamento de fatura\b/.test(text) ||
    /\bpagamento fatura\b/.test(text) ||
    /\bpag fatura\b/.test(text) ||
    /\bpagto fatura\b/.test(text)
  ) {
    return "card_payment";
  }

  if (
    /valor adicionado.*cartao de credito/.test(text) ||
    /valor adicionado.*pix no credito/.test(text) ||
    /\bpix no credito\b/.test(text) ||
    /\bemprestimo recebido\b/.test(text) ||
    /\bcredito contratado\b/.test(text)
  ) {
    return "financing";
  }

  if (
    /\bsaldo do dia\b/.test(text) ||
    /\bsaldo em conta\b/.test(text) ||
    /\blimite (total|disponivel|utilizado)\b/.test(text) ||
    /\btotal da fatura\b/.test(text) ||
    /\bvalor total da fatura\b/.test(text)
  ) {
    return "neutral";
  }

  return row.nature ?? "budget";
}

export function classifyExtractedItems(items: ExtractedItem[]) {
  return items.map((item) => {
    const aliased = { ...item, merchant: applyMerchantAlias(item.merchant) };
    const normalized = isExpenseRefund(aliased)
      ? { ...aliased, type: "income" as const }
      : aliased;
    return { ...normalized, nature: inferMovementNature(normalized) };
  });
}

function transferLike(row: MovementLike) {
  const text = textOf(row);
  return /\bpix transf\b|\btransferencia\b|\btransfer\b|\bted\b/.test(text);
}

const TOKEN_STOP = new Set([
  "transferencia",
  "transfer",
  "transf",
  "recebida",
  "recebido",
  "enviada",
  "enviado",
  "pelo",
  "pela",
  "para",
  "pix",
  "banco",
  "banc",
  "itau",
  "unibanco",
  "nubank",
  "pagamentos",
  "pagamento",
  "instituicao",
  "agencia",
  "conta",
  "brasil",
  "ltda",
  "marketplace",
  "servicos",
  "servico",
  "comercio",
  "financeira",
  "digital",
  "internet",
  "credito",
  "de",
  "da",
  "do",
  "dos",
  "das",
  "com",
]);

function identityTokens(row: MovementLike) {
  return textOf(row)
    .split(" ")
    .filter((token) => token.length >= 4 && !TOKEN_STOP.has(token) && !/^\d+$/.test(token));
}

function daysApart(a: string, b: string) {
  const left = new Date(`${a}T12:00:00`).getTime();
  const right = new Date(`${b}T12:00:00`).getTime();
  return Math.abs(left - right) / 86_400_000;
}

function sameAmount(a: number, b: number) {
  return Math.abs(a - b) < 0.005;
}

function isBusinessText(row: MovementLike) {
  const raw = `${row.merchant} ${row.description}`.toLowerCase();
  return /\/0001-|\bltda\b|\bs\.a\.?\b|\bservicos\b|\bcomercio\b|\bmarketplace\b/.test(raw);
}

function sharedIdentityTokens(a: MovementLike, b: MovementLike) {
  const bTokens = new Set(identityTokens(b));
  return identityTokens(a).filter((token) => bTokens.has(token));
}

export function reconcileTransactionNatures(transactions: Transaction[]) {
  const rows = transactions.map((row) => ({ ...row, nature: inferMovementNature(row) }));
  const identitySeeds = new Set<string>();

  for (let i = 0; i < rows.length; i += 1) {
    const a = rows[i];
    if (a.natureLocked || natureOf(a) !== "budget" || !transferLike(a)) continue;

    for (let j = i + 1; j < rows.length; j += 1) {
      const b = rows[j];
      if (b.natureLocked || natureOf(b) !== "budget" || !transferLike(b)) continue;
      if (a.type === b.type || !sameAmount(a.amount, b.amount) || daysApart(a.date, b.date) > 3) continue;

      const shared = sharedIdentityTokens(a, b);
      const distinctAccounts = Boolean(a.accountId && b.accountId && a.accountId !== b.accountId);
      const likelyPersonal = shared.length > 0 && !(isBusinessText(a) && isBusinessText(b));
      if (!distinctAccounts && !likelyPersonal) continue;

      a.nature = "transfer";
      b.nature = "transfer";
      for (const token of shared) identitySeeds.add(token);
      break;
    }
  }

  if (identitySeeds.size > 0) {
    for (const row of rows) {
      if (row.natureLocked || natureOf(row) !== "budget" || !transferLike(row) || isBusinessText(row)) continue;
      if (identityTokens(row).some((token) => identitySeeds.has(token))) row.nature = "transfer";
    }
  }

  return rows;
}
