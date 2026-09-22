import type { InstallmentKind, TxOriginKind } from "./types";

export function originMatchesInstallmentKind(
  kind: InstallmentKind,
  originKind: TxOriginKind | undefined,
) {
  return kind === "card" ? originKind === "credit_card" : originKind !== "credit_card";
}

export function allowsManualInstallmentPayment(kind: InstallmentKind) {
  return kind !== "card";
}
