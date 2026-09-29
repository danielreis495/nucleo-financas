import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countsTowardCreditCardBillTotal } from "./invoice-rules.ts";

describe("credit card invoice totals", () => {
  it("includes purchases and the current financing charge", () => {
    assert.equal(countsTowardCreditCardBillTotal("budget"), true);
    assert.equal(countsTowardCreditCardBillTotal("financing"), true);
  });

  it("excludes movements that are not charges from the current invoice", () => {
    assert.equal(countsTowardCreditCardBillTotal("card_payment"), false);
    assert.equal(countsTowardCreditCardBillTotal("investment"), false);
    assert.equal(countsTowardCreditCardBillTotal("neutral"), false);
    assert.equal(countsTowardCreditCardBillTotal("transfer"), false);
  });
});
