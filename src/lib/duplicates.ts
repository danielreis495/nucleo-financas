import { classifyExtractedItems } from "./movement-nature";
import type { ExtractedItem, Transaction, TxOriginKind } from "./types";

export type DuplicateSummary = {
  possibleCount: number;
  exactCount: number;
};

export type DuplicateContext = {
  originInstitution?: string;
  originKind?: TxOriginKind;
};

const TEXT_STOP = new Set([
  "pix",
  "transferencia",
  "transferencia",
  "enviada",
  "enviado",
  "recebida",
  "recebido",
  "compra",
  "pagamento",
  "cartao",
  "credito",
  "debito",
  "parcela",
  "nupay",
  "ltda",
  "sa",
  "de",
  "da",
  "do",
  "dos",
  "das",
  "em",
  "no",
  "na",
  "para",
]);

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?\b/g, " ")
    .replace(/\b\d+\/\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function textVariants(item: Pick<ExtractedItem | Transaction, "merchant" | "description">) {
  return [normalizeText(item.merchant), normalizeText(item.description)].filter((value) => value.length >= 2);
}

function usefulTokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .filter((token) => token.length >= 2 && !TEXT_STOP.has(token) && !/^\d+$/.test(token));
}

function jaccard(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const left = new Set(a);
  const right = new Set(b);
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const union = new Set([...left, ...right]).size;
  return union ? shared / union : 0;
}

function textSimilarity(item: ExtractedItem, transaction: Transaction) {
  const itemTexts = textVariants(item);
  const txTexts = textVariants(transaction);
  let best = 0;

  for (const left of itemTexts) {
    for (const right of txTexts) {
      if (left === right) return 1;
      const shorter = left.length <= right.length ? left : right;
      const longer = left.length > right.length ? left : right;
      if (shorter.length >= 5 && longer.includes(shorter)) best = Math.max(best, 0.9);
      best = Math.max(best, jaccard(usefulTokens(left), usefulTokens(right)));
    }
  }

  return best;
}

function sameAmount(a: number, b: number) {
  return Math.abs(a - b) < 0.005;
}

function daysApart(a: string, b: string) {
  const left = new Date(`${a}T12:00:00`).getTime();
  const right = new Date(`${b}T12:00:00`).getTime();
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.POSITIVE_INFINITY;
  return Math.abs(left - right) / 86_400_000;
}

function sameOrigin(transaction: Transaction, context?: DuplicateContext) {
  if (!context) return true;
  if (
    context.originInstitution &&
    transaction.originInstitution &&
    context.originInstitution.trim().toLowerCase() !== transaction.originInstitution.trim().toLowerCase()
  ) {
    return false;
  }
  if (context.originKind && transaction.originKind && context.originKind !== transaction.originKind) return false;
  return true;
}

function installmentCompatible(item: ExtractedItem, transaction: Transaction) {
  if (!item.installment || !transaction.installmentIndex) return true;
  return (
    item.installment.current === transaction.installmentIndex &&
    (!transaction.installmentTotal || item.installment.total === transaction.installmentTotal)
  );
}

function exactMatchScore(item: ExtractedItem, transaction: Transaction, context?: DuplicateContext) {
  if (transaction.type !== item.type || !sameAmount(transaction.amount, item.amount)) return -1;
  if (!sameOrigin(transaction, context) || !installmentCompatible(item, transaction)) return -1;

  const distance = daysApart(transaction.date, item.date);
  const similarity = textSimilarity(item, transaction);

  // Regra principal: mesma data/valor e texto suficientemente parecido.
  if (distance === 0 && similarity >= 0.5) return 10 + similarity;

  // Alguns bancos deslocam a data de processamento em um dia. Só aceitamos
  // isso quando o texto é praticamente o mesmo.
  if (distance <= 1 && similarity >= 0.9) return 8 + similarity;

  return -1;
}

function possibleMatch(item: ExtractedItem, transaction: Transaction, context?: DuplicateContext) {
  if (transaction.type !== item.type || !sameAmount(transaction.amount, item.amount)) return false;
  if (!sameOrigin(transaction, context) || !installmentCompatible(item, transaction)) return false;
  const distance = daysApart(transaction.date, item.date);
  const similarity = textSimilarity(item, transaction);
  return distance === 0 || (distance <= 2 && similarity >= 0.65) || similarity >= 0.9;
}

export function findExactDuplicate(
  item: ExtractedItem,
  transactions: Transaction[],
  usedIds: Set<string> = new Set(),
  context?: DuplicateContext,
) {
  let best: Transaction | null = null;
  let bestScore = -1;

  for (const transaction of transactions) {
    if (usedIds.has(transaction.id)) continue;
    const score = exactMatchScore(item, transaction, context);
    if (score > bestScore) {
      best = transaction;
      bestScore = score;
    }
  }

  return bestScore >= 0 ? best : null;
}

export function flagImportDuplicates(
  items: ExtractedItem[],
  transactions: Transaction[],
  context?: DuplicateContext,
) {
  let possibleCount = 0;
  let exactCount = 0;
  const classifiedItems = classifyExtractedItems(items);
  const usedExisting = new Set<string>();

  const checkedItems = classifiedItems.map((item) => {
    const exact = findExactDuplicate(item, transactions, usedExisting, context);
    const possible = transactions.some((transaction) => possibleMatch(item, transaction, context));

    if (possible) possibleCount += 1;
    if (exact) {
      exactCount += 1;
      usedExisting.add(exact.id);
      return { ...item, selected: false };
    }

    return item;
  });

  const summary: DuplicateSummary | null = possibleCount > 0 ? { possibleCount, exactCount } : null;
  return { items: checkedItems, summary };
}
