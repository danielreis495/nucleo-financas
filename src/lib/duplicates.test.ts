import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suspiciousCardCreditDuplicateGroups } from "./duplicate-rules.ts";
import type { Transaction } from "./types.ts";

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: "existing-expense",
    date: "2026-09-08",
    description: "Guaratiba supermercado",
    merchant: "Guaratiba supermercado",
    amount: 136.39,
    type: "expense",
    nature: "budget",
    status: "posted",
    category: "mercado",
    personId: "p-casa",
    accountId: null,
    split: null,
    installmentId: null,
    installmentIndex: null,
    installmentTotal: null,
    source: "pdf",
    originLabel: "Cartão Itaú",
    originInstitution: "Itaú",
    originKind: "credit_card",
    sourceFileName: "fatura-antiga.pdf",
    paymentMethod: "Cartão de crédito",
    competenceMonth: "2026-09",
    createdAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

describe("card invoice duplicate protection", () => {
  it("flags an already-saved inverted credit/expense pair from different files", () => {
    const credit = transaction({
      id: "wrong-credit",
      type: "income",
      description: "GUARATIBA SUPERMERCADO",
      sourceFileName: "fatura-nova.pdf",
      paymentMethod: "Crédito",
      createdAt: "2026-09-29T23:40:00.000Z",
    });

    const groups = suspiciousCardCreditDuplicateGroups([transaction(), credit]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].map((row) => row.id), ["existing-expense", "wrong-credit"]);
  });
});
