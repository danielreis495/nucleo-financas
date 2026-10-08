import type { InstallmentKind, InstallmentPlan, Transaction } from "./types";

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

type PlanLike = Pick<
  InstallmentPlan,
  "id" | "title" | "merchant" | "installmentAmount" | "totalCount"
>;

type InstallmentRowLike = Pick<
  Transaction,
  | "id"
  | "installmentId"
  | "installmentIndex"
  | "status"
  | "reconciledPaymentId"
  | "manualPayment"
  | "originInstitution"
  | "merchant"
  | "description"
>;

export type ImportedInstallmentMatch =
  | { kind: "realize"; planId: string; rowId: string }
  | { kind: "already_imported"; planId: string; rowId: string }
  | { kind: "add_row"; planId: string }
  | null;

function sameInstitution(left: string | undefined, right: string | undefined) {
  if (!left || !right) return true;
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Uma parcela que aparece numa nova fatura/extrato pertence ao plano já
 * cadastrado quando valor, quantidade total e nome batem. Nesse caso a linha
 * prevista do plano é "realizada" em vez de nascer um plano duplicado.
 */
export function matchImportedInstallment(
  item: { merchant: string; description: string; amount: number; installment: { current: number; total: number } },
  originInstitution: string | undefined,
  plans: PlanLike[],
  rows: InstallmentRowLike[],
): ImportedInstallmentMatch {
  const candidateName = `${item.merchant} ${item.description}`;
  let alreadyImported: ImportedInstallmentMatch = null;
  let addRow: ImportedInstallmentMatch = null;

  for (const plan of plans) {
    if (plan.totalCount !== item.installment.total) continue;
    if (Math.round(plan.installmentAmount * 100) !== Math.round(item.amount * 100)) continue;
    const planRows = rows.filter((row) => row.installmentId === plan.id);
    if (!planRows.every((row) => sameInstitution(row.originInstitution, originInstitution))) continue;
    if (!installmentNamesMatch(candidateName, [plan.title, plan.merchant, planRows[0]?.merchant])) continue;

    const row = planRows.find((entry) => entry.installmentIndex === item.installment.current);
    if (!row) {
      addRow ??= { kind: "add_row", planId: plan.id };
      continue;
    }
    if (row.status === "posted") {
      // Mesma parcela já importada (ex.: o mesmo documento de novo). Se houver
      // outro plano igual com a linha ainda prevista, ele tem prioridade.
      alreadyImported ??= { kind: "already_imported", planId: plan.id, rowId: row.id };
      continue;
    }
    if (row.reconciledPaymentId || row.manualPayment) continue;
    return { kind: "realize", planId: plan.id, rowId: row.id };
  }

  return alreadyImported ?? addRow;
}
