import type { ExtractedItem, Transaction } from "./types";

export type DuplicateMatch = {
  transactionId: string;
  confidence: "exact" | "possible";
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(pix|ted|doc|pagamento|compra|debito|credito)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function sameMoney(a: number, b: number) {
  return Math.round(a * 100) === Math.round(b * 100);
}

function dayDistance(a: string, b: string) {
  const left = Date.parse(`${a}T12:00:00Z`);
  const right = Date.parse(`${b}T12:00:00Z`);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return 999;
  return Math.round(Math.abs(left - right) / 86_400_000);
}

function textLooksSame(item: Pick<ExtractedItem, "merchant" | "description">, tx: Transaction) {
  const itemMerchant = normalizeText(item.merchant);
  const txMerchant = normalizeText(tx.merchant);
  const itemDescription = normalizeText(item.description);
  const txDescription = normalizeText(tx.description);

  if (itemMerchant && itemMerchant === txMerchant) return true;
  if (itemDescription && itemDescription === txDescription) return true;

  const left = itemMerchant || itemDescription;
  const right = txMerchant || txDescription;
  if (left.length >= 5 && right.length >= 5 && (left.includes(right) || right.includes(left))) return true;
  return false;
}

export function findDuplicateMatch(
  item: ExtractedItem,
  transactions: Transaction[],
  accountId: string | null,
): DuplicateMatch | null {
  const candidates = transactions.filter(
    (tx) => tx.status === "posted" && tx.type === item.type && sameMoney(tx.amount, item.amount),
  );

  let possible: DuplicateMatch | null = null;

  for (const tx of candidates) {
    const distance = dayDistance(item.date, tx.date);
    if (distance > 1) continue;

    const accountExact = accountId ? tx.accountId === accountId : !tx.accountId;
    const textSame = textLooksSame(item, tx);

    if (tx.transferGenerated && accountExact && distance === 0) {
      return { transactionId: tx.id, confidence: "exact" };
    }

    if (distance === 0 && accountExact && textSame) {
      return { transactionId: tx.id, confidence: "exact" };
    }

    if (textSame && (accountExact || distance === 0)) {
      possible = possible ?? { transactionId: tx.id, confidence: "possible" };
    }
  }

  return possible;
}

export function findTransferCandidate(
  tx: Transaction,
  transactions: Transaction[],
  targetAccountId?: string,
) {
  if (!tx.accountId) return null;

  return (
    transactions
      .filter(
        (candidate) =>
          candidate.id !== tx.id &&
          !candidate.transferId &&
          candidate.status === tx.status &&
          candidate.accountId &&
          candidate.accountId !== tx.accountId &&
          (!targetAccountId || candidate.accountId === targetAccountId) &&
          candidate.type !== tx.type &&
          sameMoney(candidate.amount, tx.amount) &&
          dayDistance(candidate.date, tx.date) <= 2,
      )
      .sort((a, b) => dayDistance(a.date, tx.date) - dayDistance(b.date, tx.date))[0] ?? null
  );
}
