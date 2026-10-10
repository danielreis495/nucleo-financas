import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildBankState as build,
  hiddenPlanKey,
  HIDDEN_PLAN_NATURE,
  installmentTitle,
  merchantKey,
} from "./mapper.ts";
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

/** Datas fixas: o "hoje" dos testes é 20/07/2026, logo depois das compras de exemplo. */
const buildBankState = (snap: BankSnapshot, who: typeof people, today = "2026-07-20") =>
  build(snap, who, today);

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

  it("parcelas futuras usam o vencimento da fatura", () => {
    const closing = { ...card, closeDate: "2026-09-29", dueDate: "2026-10-06" };
    const state = buildBankState(
      { ...snapshot([parcel(1), parcel(2)]), accounts: [closing] },
      people,
    );
    const third = state.transactions.find((t) => t.installmentIndex === 3)!;
    assert.equal(third.competenceMonth, "2026-09");
    assert.equal(third.date, "2026-10-06");
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

describe("mês das compras no cartão", () => {
  const closing = { ...card, closeDate: "2026-09-29", dueDate: "2026-10-06" };
  const purchase = (date: string): BankTransactionRow => ({
    ...parcel(1),
    id: `c-${date}`,
    date,
    installmentNumber: null,
    installmentTotal: null,
    purchaseDate: null,
    billMonth: "2026-10",
  });

  it("compra antes do fechamento conta no mês em que foi feita", () => {
    const state = buildBankState(
      { ...snapshot([purchase("2026-09-17")]), accounts: [closing] },
      people,
    );
    assert.equal(state.transactions[0].competenceMonth, "2026-09");
  });

  it("compra depois do fechamento entra na fatura do mês seguinte", () => {
    const state = buildBankState(
      { ...snapshot([purchase("2026-09-30")]), accounts: [closing] },
      people,
    );
    assert.equal(state.transactions[0].competenceMonth, "2026-10");
  });
});

describe("casos vistos no app (prints de 09/10/2026)", () => {
  const itau: BankAccountRow = {
    ...card,
    id: "itau-card",
    institution: "Itaú",
    number: "4731",
    closeDate: "2026-09-29",
    dueDate: "2026-10-05",
  };
  const annuity = (index: number, date: string): BankTransactionRow => ({
    ...parcel(index),
    id: `anuidade-${index}`,
    accountId: "itau-card",
    date,
    description: `ANUIDADE DIFERENCI${String(index).padStart(2, "0")}/12`,
    merchant: `ANUIDADE DIFERENCI${String(index).padStart(2, "0")}/12`,
    amount: 25,
    installmentTotal: 12,
    purchaseDate: null,
  });

  it("número da parcela colado ao nome não separa o parcelamento", () => {
    assert.equal(merchantKey("ANUIDADE DIFERENCI01/12"), merchantKey("ANUIDADE DIFERENCI04/12"));
    assert.equal(merchantKey("CP *AMIGAO 1-CT QU01/02"), merchantKey("CP *AMIGAO 1-CT QU02/02"));
    assert.equal(installmentTitle("ANUIDADE DIFERENCI04/12"), "ANUIDADE DIFERENCI");
    assert.equal(installmentTitle("Cp *Amigao 51 Metropol 1/2"), "Cp *Amigao 51 Metropol");
  });

  it("anuidade 01, 02 e 04/12 vira um único parcelamento com o progresso certo", () => {
    const state = buildBankState(
      {
        ...snapshot([
          annuity(1, "2026-01-10"),
          annuity(2, "2026-02-10"),
          annuity(4, "2026-04-10"),
        ]),
        accounts: [itau],
      },
      people,
      "2026-04-20",
    );
    assert.equal(state.plans.length, 1);
    assert.equal(state.plans[0].title, "ANUIDADE DIFERENCI");
    const scheduled = state.transactions.filter((t) => t.status === "scheduled");
    assert.equal(scheduled.length, 8, "parcelas 5 a 12");
    assert.equal(scheduled[0].competenceMonth, "2026-05");
  });

  it("duas compras parceladas na mesma farmácia ficam separadas", () => {
    const raia = (id: string, amount: number, purchaseDate: string): BankTransactionRow => ({
      ...parcel(1),
      id,
      merchant: "RAIA DROGASIL S/A",
      description: "RAIA DROGASIL S/A",
      amount,
      installmentTotal: 2,
      purchaseDate,
    });
    const state = buildBankState(
      snapshot([raia("a", 91.94, "2026-07-03"), raia("b", 99.65, "2026-07-10")]),
      people,
    );
    assert.equal(state.plans.length, 2);
  });

  it("parcelas com centavos de diferença continuam no mesmo parcelamento", () => {
    const state = buildBankState(
      snapshot([parcel(1, { amount: 44.97 }), parcel(2, { amount: 44.98 })]),
      people,
      "2026-08-20",
    );
    assert.equal(state.plans.length, 1);
  });

  it("parcela de mês que já passou não aparece como próxima", () => {
    const state = buildBankState(
      snapshot([parcel(1, { installmentTotal: 2, purchaseDate: "2025-12-03", date: "2025-12-03" })]),
      people,
      "2026-10-09",
    );
    assert.equal(state.plans.length, 1);
    assert.equal(state.transactions.filter((t) => t.status === "scheduled").length, 0);
  });
});
