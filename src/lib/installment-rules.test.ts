import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowsManualInstallmentPayment,
  originMatchesInstallmentKind,
} from "./installment-rules.ts";

describe("installment reconciliation rules", () => {
  it("links card plans only to individual card movements", () => {
    assert.equal(originMatchesInstallmentKind("card", "credit_card"), true);
    assert.equal(originMatchesInstallmentKind("card", "bank_account"), false);
    assert.equal(originMatchesInstallmentKind("card", undefined), false);
  });

  it("links loans and other plans to non-card movements", () => {
    assert.equal(originMatchesInstallmentKind("loan", "bank_account"), true);
    assert.equal(originMatchesInstallmentKind("other", "manual"), true);
    assert.equal(originMatchesInstallmentKind("loan", "credit_card"), false);
  });

  it("keeps manual payment confirmation disabled for card plans", () => {
    assert.equal(allowsManualInstallmentPayment("card"), false);
    assert.equal(allowsManualInstallmentPayment("loan"), true);
    assert.equal(allowsManualInstallmentPayment("other"), true);
  });
});
