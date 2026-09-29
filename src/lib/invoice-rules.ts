import type { TxNature } from "./types";

export function countsTowardCreditCardBillTotal(nature: TxNature) {
  return nature === "budget" || nature === "financing";
}
