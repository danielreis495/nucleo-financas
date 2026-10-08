import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBankState, hiddenPlanKey, HIDDEN_PLAN_NATURE } from "./mapper.ts";
import type { BankAccountRow, BankSnapshot, BankTransactionRow } from "./types.ts";

const people = [{ id: "p-you", name: "Você", role: "you", color: "p1", monthlyBudget: null }] as never;

const card: BankAccountRow = {
  id: "card-1",
  itemId: "item-1",
  ownerRole: "you",
  type: "CREDIT",
  subtype: "CREDIT_CARD",
  name: "Cartão",
  number: "1234",
  institution: "Nubank",
  balance: null,
  creditLimit: null,
  availableLimit: null,
  dueDate: "2026-10-10",
  closeDate: null,
  updatedAt: "2026-10-08T12:00:00Z",
};

function parcel(index: number, extra: Partial<BankTransactionRow> = {}): BankTransactionRow {
  return {
    id: `tx-${index}`,
    accountId: "card-1",
    date: "2026-07-15",
    description: `LOJA X ${index}/6`,
    merchant: "LOJA X",
    amount: 100,
    direction: "DEBIT",
    status: "POSTED",
    category: null,
    operationType: null,
    installmentNumber: index,
    installmentTotal: 6,
    purchaseDate: "2026-07-15",
    billMonth: null,
    createdAt: null,
    ...extra,
  };
}

function snapshot(transactions: BankTransactionRow[], overrides: BankSnapshot["overrides"] = []) {
  return {
    accounts: [card],
    transactions,
    overrides,
    rules: [],
    lastSync: null,
    lastSuccessAt: null,
  } satisfies BankSnapshot;
}

describe("parcelamentos vindos do banco", () => {
  it("parcelas da mesma compra sem mês de fatura viram um único parcelamento", () => {
    const state = buildBankState(snapshot([parcel(1), parcel(2), parcel(3)]), people);
    assert.equal(state.plans.length, 1);
    const scheduled = state.transactions.filter((t) => t.status === "scheduled");
    assert.equal(scheduled.length, 3, "só as parcelas 4, 5 e 6 ficam previstas");
  });

  it("mês da fatura define o início do parcelamento", () => {
    const state = buildBankState(
      snapshot([parcel(2, { billMonth: "2026-09" }), parcel(3, { billMonth: "2026-10" })]),
      people,
    );
    assert.equal(state.plans.length, 1);
    assert.equal(state.plans[0].startDate, "2026-08-01");
  });

  it("parcelamento removido não volta e as compras reais continuam", () => {
    const first = buildBankState(snapshot([parcel(1), parcel(2)]), people);
    const key = hiddenPlanKey(first.plans[0].id);
    const state = buildBankState(
      snapshot([parcel(1), parcel(2)], [
        { txId: key, category: null, personId: null, nature: HIDDEN_PLAN_NATURE },
      ]),
      people,
    );
    assert.equal(state.plans.length, 0);
    assert.equal(state.transactions.length, 2);
    assert.ok(state.transactions.every((t) => t.status === "posted" && !t.installmentId));
    assert.ok(key.length <= 100);
  });
});

describe("mês das parcelas sem fatura informada", () => {
  it("cada parcela cai no seu mês a partir da data da compra", () => {
    const state = buildBankState(snapshot([parcel(1), parcel(2), parcel(3)]), people);
    const months = state.transactions
      .filter((t) => t.status === "posted")
      .map((t) => t.competenceMonth)
      .sort();
    assert.deepEqual(months, ["2026-07", "2026-08", "2026-09"]);
    assert.equal(state.plans[0].startDate, "2026-07-01");
  });
});
