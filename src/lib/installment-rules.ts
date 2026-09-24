import type { InstallmentKind, Transaction } from "./types";

function nameTokens(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((token) => token.length >= 4);
}

function tokensMatch(left: string, right: string) {
  return (
    left === right ||
    (left.length >= 5 && right.length >= 5 && (left.startsWith(right) || right.startsWith(left)))
  );
}

export function installmentNamesMatch(
  candidateName: string,
  references: Array<string | undefined>,
) {
  const candidateTokens = nameTokens(candidateName);
  if (!candidateTokens.length) return false;

  return references.some((reference) => {
    const referenceTokens = nameTokens(reference);
    if (!referenceTokens.length) return false;
    const matches = referenceTokens.filter((token) =>
      candidateTokens.some((candidate) => tokensMatch(token, candidate)),
    ).length;
    return matches >= Math.min(2, referenceTokens.length, candidateTokens.length);
  });
}

type ReconciliationTransaction = Pick<
  Transaction,
  "id" | "amount" | "description" | "merchant" | "reconciledPaymentId" | "status" | "type"
>;

export function isInstallmentReconciliationCandidate(
  installment: Pick<Transaction, "id" | "amount">,
  candidate: ReconciliationTransaction,
  references: Array<string | undefined>,
) {
  if (
    candidate.id === installment.id ||
    candidate.reconciledPaymentId ||
    candidate.status !== "posted" ||
    candidate.type !== "expense" ||
    Math.round(candidate.amount * 100) !== Math.round(installment.amount * 100)
  ) {
    return false;
  }

  return installmentNamesMatch(`${candidate.merchant} ${candidate.description}`, references);
}

export function allowsManualInstallmentPayment(kind: InstallmentKind) {
  return kind !== "card";
}
