import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowsManualInstallmentPayment,
  isInstallmentReconciliationCandidate,
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

  it("accepts a matching movement from another date or the same plan", () => {
    const installment = { id: "parcela-3", amount: 248.43 };
    const candidate = {
      id: "parcela-4",
      amount: 248.43,
      description: "Parcelamen fatura 04/04",
      merchant: "Banco Itaú S.A.",
      reconciledPaymentId: undefined,
      status: "posted" as const,
      type: "expense" as const,
    };

    assert.equal(
      isInstallmentReconciliationCandidate(installment, candidate, ["PARCELAMEN FATURA"]),
      true,
    );
  });

  it("never offers the selected installment as its own movement", () => {
    const installment = { id: "parcela-3", amount: 248.43 };
    const candidate = {
      id: "parcela-3",
      amount: 248.43,
      description: "Parcelamen fatura 03/04",
      merchant: "Banco Itaú S.A.",
      reconciledPaymentId: undefined,
      status: "posted" as const,
      type: "expense" as const,
    };

    assert.equal(
      isInstallmentReconciliationCandidate(installment, candidate, ["PARCELAMEN FATURA"]),
      false,
    );
  });

  it("keeps manual payment confirmation disabled for card plans", () => {
    assert.equal(allowsManualInstallmentPayment("card"), false);
    assert.equal(allowsManualInstallmentPayment("loan"), true);
    assert.equal(allowsManualInstallmentPayment("other"), true);
  });
});
