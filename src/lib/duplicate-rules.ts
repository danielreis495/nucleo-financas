import type { Transaction } from "./types";

function normalize(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(row: Pick<Transaction, "merchant" | "description">) {
  return new Set(
    normalize(`${row.merchant} ${row.description}`)
      .split(" ")
      .filter((token) => token.length >= 4),
  );
}

function similarNames(left: Transaction, right: Transaction) {
  const leftText = normalize(`${left.merchant} ${left.description}`);
  const rightText = normalize(`${right.merchant} ${right.description}`);
  if (leftText === rightText || leftText.includes(rightText) || rightText.includes(leftText)) return true;
  const rightTokens = tokens(right);
  return [...tokens(left)].some((token) => rightTokens.has(token));
}

function isNamedRefund(row: Transaction) {
  return /\b(estorno|reembolso|cashback|devolucao|credito de compra|credito da compra|credito na fatura|credito da fatura|ajuste a credito|compra cancelada)\b/.test(
    normalize(`${row.merchant} ${row.description}`),
  );
}

export function suspiciousCardCreditDuplicateGroups(transactions: Transaction[]) {
  const incomes = transactions.filter(
    (row) =>
      row.status === "posted" &&
      row.originKind === "credit_card" &&
      row.type === "income" &&
      !isNamedRefund(row),
  );
  const expenses = transactions.filter(
    (row) => row.status === "posted" && row.originKind === "credit_card" && row.type === "expense",
  );
  const usedExpenses = new Set<string>();
  const groups: Transaction[][] = [];

  for (const income of incomes) {
    const match = expenses.find(
      (expense) =>
        !usedExpenses.has(expense.id) &&
        expense.date === income.date &&
        Math.abs(expense.amount - income.amount) < 0.005 &&
        (!expense.originInstitution ||
          !income.originInstitution ||
          normalize(expense.originInstitution) === normalize(income.originInstitution)) &&
        similarNames(expense, income),
    );
    if (!match) continue;
    usedExpenses.add(match.id);
    groups.push([match, income]);
  }

  return groups;
}
