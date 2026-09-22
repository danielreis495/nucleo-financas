import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowsManualInstallmentPayment,
  installmentNamesMatch,
} from "./installment-rules.ts";

describe("installment reconciliation rules", () => {
  it("matches the real installment name even when the plan title is truncated", () => {
    assert.equal(
      installmentNamesMatch("Parcelamento de Fatura", ["PARCELAMEN FATURA", "Banco Itaú S.A."]),
      true,
    );
  });

  it("ignores accents and accepts a shared meaningful name", () => {
    assert.equal(installmentNamesMatch("Financiamento da Moto", ["FINANCIAMENTO MOTO"]), true);
  });

  it("rejects an unrelated movement with the same value", () => {
    assert.equal(
      installmentNamesMatch("Mercado Central", ["Parcelamento de Fatura", "Banco Itaú"]),
      false,
    );
  });

  it("keeps manual payment confirmation disabled for card plans", () => {
    assert.equal(allowsManualInstallmentPayment("card"), false);
    assert.equal(allowsManualInstallmentPayment("loan"), true);
    assert.equal(allowsManualInstallmentPayment("other"), true);
  });
});
