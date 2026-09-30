import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countsTowardCreditCardBillTotal,
  normalizeCreditCardBillItems,
} from "./invoice-rules.ts";
import { paymentMethodForItem } from "./transaction-origin.ts";
import type { ExtractedItem } from "./types.ts";

function item(overrides: Partial<ExtractedItem> = {}): ExtractedItem {
  return {
    id: "item-1",
    description: "GUARATIBA SUPERMERCADO",
    merchant: "Guaratiba supermercado",
    amount: 136.39,
    date: "2026-09-08",
    type: "income",
    nature: "budget",
    category: "mercado",
    personId: "p-casa",
    selected: true,
    installment: null,
    ...overrides,
  };
}

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

  it("turns card purchases misread as income back into expenses", () => {
    const [normalized] = normalizeCreditCardBillItems([item()], undefined, "credit_card");
    assert.equal(normalized.type, "expense");
  });

  it("keeps explicit and signed card refunds as income", () => {
    const documentText = "18/08 AMAZON BR *Amazon BR - 0,01";
    const signed = item({
      merchant: "AMAZON BR *Amazon BR",
      description: "AMAZON BR *Amazon BR",
      amount: 0.01,
      date: "2026-08-18",
    });
    const explicit = item({ merchant: "ESTORNO ANUIDADE", description: "ESTORNO ANUIDADE" });

    assert.equal(
      normalizeCreditCardBillItems([signed], documentText, "credit_card")[0].type,
      "income",
    );
    assert.equal(
      normalizeCreditCardBillItems([explicit], undefined, "credit_card")[0].type,
      "income",
    );
  });

  it("does not change bank account movements", () => {
    assert.equal(normalizeCreditCardBillItems([item()], undefined, "bank_account")[0].type, "income");
  });

  it("uses clear card payment-method labels", () => {
    const origin = { originLabel: "Cartão Itaú", originKind: "credit_card" as const };
    assert.equal(paymentMethodForItem({ ...item(), type: "expense" }, origin), "Cartão de crédito");
    assert.equal(paymentMethodForItem(item(), origin), "Crédito na fatura");
  });
});
