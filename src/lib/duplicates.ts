import type { ExtractedItem, Transaction } from "./types";

export type DuplicateSummary = {
  possibleCount: number;
  exactCount: number;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function textVariants(item: Pick<ExtractedItem | Transaction, "merchant" | "description">) {
  return [normalizeText(item.merchant), normalizeText(item.description)].filter((value) => value.length >= 3);
}

function sharesExactText(item: ExtractedItem, transaction: Transaction) {
  const itemTexts = textVariants(item);
  const transactionTexts = textVariants(transaction);
  return itemTexts.some((itemText) => transactionTexts.includes(itemText));
}

function sameAmount(a: number, b: number) {
  return Math.abs(a - b) < 0.005;
}

export function flagImportDuplicates(items: ExtractedItem[], transactions: Transaction[]) {
  let possibleCount = 0;
  let exactCount = 0;

  const checkedItems = items.map((item) => {
    let possible = false;
    let exact = false;

    for (const transaction of transactions) {
      if (transaction.type !== item.type || !sameAmount(transaction.amount, item.amount)) continue;

      const sameDate = transaction.date === item.date;
      const sameText = sharesExactText(item, transaction);

      if (sameDate || sameText) possible = true;
      if (sameDate && sameText) {
        exact = true;
        break;
      }
    }

    if (possible) possibleCount += 1;
    if (exact) exactCount += 1;

    return exact ? { ...item, selected: false } : item;
  });

  const summary: DuplicateSummary | null = possibleCount > 0 ? { possibleCount, exactCount } : null;
  return { items: checkedItems, summary };
}
