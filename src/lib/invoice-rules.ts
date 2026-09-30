import type { ExtractedItem, TxNature, TxOriginKind } from "./types";

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBrAmount(amount: number) {
  const [integer, cents] = amount.toFixed(2).split(".");
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}

function refundText(item: Pick<ExtractedItem, "merchant" | "description">) {
  return /\b(estorno|reembolso|cashback|devolucao|credito de compra|credito da compra|credito na fatura|credito da fatura|ajuste a credito|compra cancelada)\b/.test(
    normalize(`${item.merchant} ${item.description}`),
  );
}

function sourceShowsNegativeAmount(item: ExtractedItem, documentText: string | undefined) {
  if (!documentText) return false;
  const [, , month, day] = item.date.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  const date = day && month ? `${day}/${month}` : "";
  const amount = formatBrAmount(item.amount);
  const itemTokens = new Set(
    normalize(`${item.merchant} ${item.description}`)
      .split(" ")
      .filter((token) => token.length >= 4),
  );

  return documentText.split("\n").some((line) => {
    const compact = line.replace(/\s+/g, "").replace(/−/g, "-");
    if (!compact.includes(`-${amount}`) || (date && !line.includes(date))) return false;
    const lineTokens = new Set(normalize(line).split(" "));
    return [...itemTokens].some((token) => lineTokens.has(token));
  });
}

export function countsTowardCreditCardBillTotal(nature: TxNature) {
  return nature === "budget" || nature === "financing";
}

/**
 * Em faturas, valores positivos nas tabelas são cobranças. Alguns modelos
 * confundem a palavra “crédito” do cartão com entrada de dinheiro; corrigimos
 * isso localmente e só mantemos income quando o documento prova um estorno.
 */
export function normalizeCreditCardBillItems(
  items: ExtractedItem[],
  documentText: string | undefined,
  originKind: TxOriginKind,
) {
  if (originKind !== "credit_card") return items;

  return items.map((item) => {
    if (item.nature && item.nature !== "budget" && item.nature !== "financing") return item;
    const credit = refundText(item) || sourceShowsNegativeAmount(item, documentText);
    return { ...item, type: credit ? ("income" as const) : ("expense" as const) };
  });
}
