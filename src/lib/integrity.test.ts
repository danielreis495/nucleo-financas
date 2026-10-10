import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { cashPositionForMonth } from "./cash-position.ts";
import { matchesKnownHolderTransfer } from "./document-summary.ts";
import { flagImportDuplicates } from "./duplicates.ts";
import { reconcileTransactionNatures } from "./movement-nature.ts";
import { financialSnapshot, monthTransactions, planProgress } from "./selectors.ts";
import { useFinanceStore } from "./store.ts";
import type { ExtractedItem, FinancialDocumentSummary, Transaction } from "./types.ts";
import type { ImportOrigin } from "./transaction-origin.ts";
import { addMonthsIso } from "./utils.ts";

const store = () => useFinanceStore.getState();

function item(overrides: Partial<ExtractedItem> = {}): ExtractedItem {
  return {
    id: crypto.randomUUID(),
    description: "LOJA X",
    merchant: "LOJA X",
    amount: 100,
    date: "2026-08-10",
    type: "expense",
    category: "outros",
    personId: "p-you",
    selected: true,
    installment: null,
    ...overrides,
  };
}

function cardBill(month: string): ImportOrigin {
  return {
    originLabel: "Cartão Nubank",
    originInstitution: "Nubank",
    originKind: "credit_card",
    sourceFileName: `fatura-${month}.pdf`,
    competenceMonth: month,
  };
}

const parcel = (current: number, date: string) =>
  item({ installment: { current, total: 10, kind: "card" }, date });

/** Simula a tela de captura: confere duplicados e importa o que ficou marcado. */
function importBill(items: ExtractedItem[], month: string) {
  const checked = flagImportDuplicates(items, store().transactions, cardBill(month));
  store().importExtracted(checked.items, "pdf", null, cardBill(month));
  return checked;
}

beforeEach(() => store().clearAll());

describe("parcelas de cartão ao longo das faturas", () => {
  for (const nextLineDate of ["2026-06-10", "2026-07-10"]) {
    it(`a parcela 4/10 da fatura seguinte realiza o plano existente (data da linha ${nextLineDate})`, () => {
      importBill([parcel(3, "2026-06-10")], "2026-08");
      assert.equal(store().plans.length, 1);

      importBill([parcel(4, nextLineDate)], "2026-09");

      assert.equal(store().plans.length, 1, "não pode nascer um plano duplicado");
      const fourth = store().transactions.find((row) => row.installmentIndex === 4)!;
      assert.equal(fourth.status, "posted");
      assert.equal(fourth.competenceMonth, "2026-09");
      assert.equal(financialSnapshot(store(), "2026-09").postedExpense, 100);
      assert.equal(monthTransactions(store(), "2026-09").length, 1, "entra no orçamento por categoria");
      assert.equal(financialSnapshot(store(), "2026-10").scheduledExpense, 100, "sem previsão em dobro");
      assert.equal(planProgress(store(), store().plans[0].id).paid, 4);
    });
  }

  it("reimportar a mesma fatura não duplica nem altera o plano", () => {
    importBill([parcel(3, "2026-06-10")], "2026-08");
    const before = store().transactions.length;
    const checked = importBill([parcel(3, "2026-06-10")], "2026-08");
    assert.equal(checked.items[0].selected, false);
    assert.equal(store().transactions.length, before);
    assert.equal(store().plans.length, 1);
  });

  it("excluir o plano mantém a compra que já veio na fatura", () => {
    importBill([parcel(3, "2026-08-10")], "2026-08");
    assert.equal(financialSnapshot(store(), "2026-08").postedExpense, 100);
    store().removeInstallmentPlan(store().plans[0].id);
    assert.equal(financialSnapshot(store(), "2026-08").postedExpense, 100);
    assert.equal(financialSnapshot(store(), "2026-09").scheduledExpense, 0);
    assert.equal(store().transactions.filter((row) => row.installmentId).length, 0);
  });
});

describe("parcela vinda de extrato bancário", () => {
  it("a parcela do extrato é real e as anteriores não são inventadas", () => {
    store().importExtracted(
      [item({ installment: { current: 3, total: 10, kind: "other" }, date: "2026-09-05" })],
      "pdf",
      null,
      { originLabel: "Conta Itaú", originInstitution: "Itaú", originKind: "bank_account" },
    );
    const rows = store()
      .transactions.filter((row) => row.installmentId)
      .sort((a, b) => a.installmentIndex! - b.installmentIndex!);
    assert.equal(rows[0].installmentIndex, 3);
    assert.equal(rows[0].status, "posted");
    assert.equal(rows[1].status, "scheduled");
    assert.equal(rows[1].date, "2026-10-05");
    assert.equal(planProgress(store(), store().plans[0].id).paid, 3);
  });
});

describe("datas de parcelas no fim do mês", () => {
  it("31/01 vira o último dia dos meses curtos", () => {
    assert.equal(addMonthsIso("2027-01-31", 1), "2027-02-28");
    assert.equal(addMonthsIso("2028-01-31", 1), "2028-02-29");
    store().addInstallmentPlan({
      title: "Empréstimo",
      merchant: "Banco",
      kind: "loan",
      installmentAmount: 500,
      totalCount: 4,
      startDate: "2027-01-31",
      personId: "p-you",
      category: "outros",
    });
    assert.deepEqual(
      store()
        .transactions.map((row) => row.date)
        .sort(),
      ["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"],
    );
  });
});

describe("conciliação preservada", () => {
  function linkedLoan() {
    store().addInstallmentPlan({
      title: "Dívida",
      merchant: "Credor",
      kind: "loan",
      installmentAmount: 200,
      totalCount: 2,
      startDate: "2026-09-15",
      personId: "p-you",
      category: "outros",
    });
    store().addQuickExpense({ amount: 200, category: "outros", personId: "p-you", description: "Credor" });
    const payment = store().transactions[0];
    const installment = store().transactions.find((row) => row.installmentIndex === 1)!;
    assert.equal(store().reconcileInstallment(installment.id, payment.id), true);
    return { payment, installment };
  }

  const linkOf = (id: string) => store().transactions.find((row) => row.id === id)!.reconciledPaymentId;

  it("atualizar origem ou categoria do pagamento não desfaz o vínculo", () => {
    const { payment, installment } = linkedLoan();
    store().updateTransaction(payment.id, {
      originLabel: "Conta Itaú",
      originInstitution: "Itaú",
      originKind: "bank_account",
      category: "contas",
    });
    assert.equal(linkOf(installment.id), payment.id);
  });

  it("mudar o valor do pagamento desfaz o vínculo e registra no histórico", () => {
    const { payment, installment } = linkedLoan();
    store().updateTransaction(payment.id, { amount: 150 });
    assert.equal(linkOf(installment.id), undefined);
    const history = store().transactions.find((row) => row.id === installment.id)!.reconciliationHistory!;
    assert.deepEqual(
      history.map((event) => event.action),
      ["link", "unlink"],
    );
  });

  it("editar a categoria de uma parcela paga manualmente não desfaz a baixa", () => {
    store().addAccount({ name: "Conta", institution: "Itaú", type: "checking", openingBalance: 0 });
    store().addInstallmentPlan({
      title: "Dívida",
      merchant: "Amigo",
      kind: "other",
      installmentAmount: 100,
      totalCount: 2,
      startDate: "2026-01-10",
      personId: "p-you",
      category: "outros",
    });
    const row = store().transactions.find((t) => t.installmentIndex === 1)!;
    const accountId = store().accounts[0].id;
    assert.equal(store().confirmInstallmentPaid(row.id, { date: "2026-01-10", accountId }), true);
    store().updateTransaction(row.id, { category: "contas" });
    assert.ok(store().transactions.find((t) => t.id === row.id)!.manualPayment);
    store().updateTransaction(row.id, { date: "2026-01-12" });
    assert.equal(store().transactions.find((t) => t.id === row.id)!.manualPayment, undefined);
  });
});

describe("transferências do titular", () => {
  it("sobrenome em comum não vira transferência", () => {
    const pix = (name: string) => ({ merchant: name, description: `PIX TRANSF ${name}`, nature: "budget" });
    assert.equal(matchesKnownHolderTransfer(pix("MARIA SILVA"), ["DANIEL REIS SILVA"]), false);
    assert.equal(matchesKnownHolderTransfer(pix("JOSE DOS REIS"), ["DANIEL REIS SILVA"]), false);
    assert.equal(matchesKnownHolderTransfer(pix("DANIEL R SILVA"), ["DANIEL REIS SILVA"]), true);
    assert.equal(matchesKnownHolderTransfer(pix("DANIEL REIS SILVA"), ["DANIEL REIS SILVA"]), true);
  });

  it("um par de transferências não arrasta Pix de quem só compartilha o sobrenome", () => {
    const base = {
      merchant: "",
      type: "expense",
      status: "posted",
      category: "outros",
      personId: "p-you",
      split: null,
      installmentId: null,
      installmentIndex: null,
      installmentTotal: null,
      source: "pdf",
      createdAt: "2026-09-01T00:00:00.000Z",
    } as const;
    const rows: Transaction[] = [
      { ...base, id: "a", description: "PIX TRANSF DANIEL SILVA", amount: 500, date: "2026-09-01", accountId: "itau" },
      { ...base, id: "b", description: "TRANSFERENCIA RECEBIDA DANIEL SILVA", amount: 500, date: "2026-09-01", type: "income", accountId: "nubank" },
      { ...base, id: "c", description: "PIX TRANSF MARIA SILVA", amount: 80, date: "2026-09-03", accountId: "itau" },
    ];
    const result = reconcileTransactionNatures(rows);
    assert.equal(result.find((row) => row.id === "a")!.nature, "transfer");
    assert.equal(result.find((row) => row.id === "c")!.nature, "budget");
  });
});

describe("faturas do casal no mesmo banco", () => {
  it("duas faturas Nubank de titulares diferentes somam", () => {
    const bill = (id: string, holderName: string, billTotal: number): FinancialDocumentSummary => ({
      id,
      kind: "credit_card_bill",
      institution: "Nubank",
      holderName,
      importedAt: `2026-09-0${id}`,
      referenceMonth: "2026-09",
      billTotal,
      dueDate: "2026-09-15",
    });
    const position = cashPositionForMonth([bill("1", "DANIEL", 1200), bill("2", "ESPOSA", 800)], "2026-09", []);
    assert.equal(position.billRows.length, 2);
    assert.equal(position.billsDue, 2000);
  });

  it("a mesma fatura reimportada sem titular não conta duas vezes", () => {
    const first: FinancialDocumentSummary = {
      id: "1",
      kind: "credit_card_bill",
      institution: "Nubank",
      holderName: "DANIEL",
      importedAt: "2026-09-01",
      referenceMonth: "2026-09",
      billTotal: 1200,
      dueDate: "2026-09-15",
    };
    const second = { ...first, id: "2", holderName: undefined, importedAt: "2026-09-02" };
    assert.equal(cashPositionForMonth([first, second], "2026-09", []).billsDue, 1200);
  });
});

describe("caixa real com dados do banco", () => {
  it("saldo do banco substitui o extrato em PDF do mesmo mês, sem somar os dois", async () => {
    const { withBankSummaries } = await import("./cash-position.ts");
    const pdf: FinancialDocumentSummary = {
      id: "pdf",
      kind: "bank_statement",
      institution: "Itaú",
      holderName: "DANIEL",
      importedAt: "2026-10-02",
      referenceMonth: "2026-10",
      balance: 100,
      balanceDate: "2026-10-02",
    };
    const old: FinancialDocumentSummary = { ...pdf, id: "old", referenceMonth: "2026-08", balanceDate: "2026-08-30" };
    const bank: FinancialDocumentSummary = {
      ...pdf,
      id: "bank",
      holderName: "Conta Itaú",
      importedAt: "2026-10-10",
      balance: 45.26,
      balanceDate: "2026-10-10",
    };
    const merged = withBankSummaries([pdf, old], [bank]);
    assert.deepEqual(merged.map((s) => s.id).sort(), ["bank", "old"]);
    assert.equal(cashPositionForMonth([pdf], "2026-10", [], [bank]).cashBalance, 45.26);
  });
});
