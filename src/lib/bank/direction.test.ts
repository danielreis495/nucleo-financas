import assert from "node:assert/strict";
import { test } from "node:test";
import { cardDirection } from "./direction.ts";

test("cartão: compra positiva é débito", () => {
  assert.equal(cardDirection({ amount: 120.5, type: "DEBIT", operationType: null }), "DEBIT");
});

test("cartão: estorno com valor negativo é crédito mesmo vindo como DEBIT", () => {
  assert.equal(cardDirection({ amount: -59.9, type: "DEBIT", operationType: null }), "CREDIT");
});

test("cartão: operação ESTORNO é crédito mesmo com valor positivo", () => {
  assert.equal(cardDirection({ amount: 59.9, type: "DEBIT", operationType: "ESTORNO" }), "CREDIT");
});

test("cartão: pagamento da fatura (negativo) é crédito", () => {
  assert.equal(
    cardDirection({ amount: -3434.05, type: "CREDIT", operationType: "PAGAMENTO_FATURA" }),
    "CREDIT",
  );
});
