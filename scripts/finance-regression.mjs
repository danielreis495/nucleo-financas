import assert from "node:assert/strict";
import { createServer } from "vite";

// Isolated in-memory store; no production data or network requests.
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { useFinanceStore: store } = await server.ssrLoadModule("/src/lib/store.ts");
  const { financialSnapshot, planProgress } = await server.ssrLoadModule("/src/lib/selectors.ts");
  store.getState().clearAll();
  store
    .getState()
    .addPlannedIncome({ label: "Entrada prevista", amount: 1000, date: "2026-09-25" });
  store
    .getState()
    .addInstallmentPlan({
      title: "Dívida",
      merchant: "Credor",
      kind: "loan",
      installmentAmount: 200,
      totalCount: 2,
      startDate: "2026-09-15",
      personId: "p-you",
      category: "outros",
    });
  const first = store.getState().transactions[0];
  assert.equal(first.status, "scheduled");
  store.getState().advanceDueInstallments();
  assert.equal(store.getState().transactions[0].status, "scheduled");
  const snapshot = financialSnapshot(store.getState(), "2026-09");
  assert.equal(snapshot.receivedIncome, 0);
  assert.equal(snapshot.expectedIncome, 1000);
  assert.equal(snapshot.margin, 800);
  assert.equal(planProgress(store.getState(), first.installmentId).paid, 0);
  store
    .getState()
    .addQuickExpense({ amount: 200, category: "outros", personId: "p-you", description: "Credor" });
  const payment = store.getState().transactions[0];
  store.getState().updateTransaction(payment.id, { date: "2026-09-15" });
  assert.equal(store.getState().reconcileInstallment(first.id, payment.id), true);
  assert.equal(financialSnapshot(store.getState(), "2026-09").plannedOutflow, 200);
  assert.equal(planProgress(store.getState(), first.installmentId).paid, 1);
  const other = store
    .getState()
    .transactions.find((row) => row.installmentId && row.id !== first.id);
  assert.equal(store.getState().reconcileInstallment(other.id, payment.id), false);
  assert.equal(store.getState().reconcileInstallment(first.id, null), true);
  assert.equal(planProgress(store.getState(), first.installmentId).paid, 0);
  assert.equal(store.getState().reconcileInstallment(first.id, payment.id), true);
  store.getState().removeTransaction(payment.id);
  assert.equal(planProgress(store.getState(), first.installmentId).paid, 0);
  assert.equal(
    store.getState().transactions.find((row) => row.id === first.id).reconciliationHistory.length,
    4,
  );
  store.getState().clearAll();
  store
    .getState()
    .addAccount({
      name: "Conta teste",
      institution: "Banco teste",
      type: "checking",
      openingBalance: 0,
    });
  const accountId = store.getState().accounts[0].id;
  store
    .getState()
    .addInstallmentPlan({
      title: "Teste financiamento",
      merchant: "Teste",
      kind: "card",
      installmentAmount: 150,
      totalCount: 37,
      startDate: "2026-09-09",
      personId: "p-you",
      category: "outros",
    });
  const target = store.getState().transactions[0];
  // Reproduces a legacy posted installment, without uploading any personal backup data.
  store.getState().updateTransaction(target.id, { status: "posted", accountId });
  const before = JSON.stringify(store.getState().transactions);
  assert.equal(store.getState().updateInstallmentKind(target.installmentId, "loan"), true);
  assert.equal(JSON.stringify(store.getState().transactions), before);
  const expense = financialSnapshot(store.getState(), "2026-09").plannedOutflow;
  assert.equal(
    store.getState().confirmInstallmentPaid(target.id, { date: "2026-02-30", accountId }),
    false,
  );
  assert.equal(
    store
      .getState()
      .confirmInstallmentPaid(target.id, { date: "2026-09-09", accountId: "missing" }),
    false,
  );
  assert.equal(
    store.getState().confirmInstallmentPaid(target.id, { date: "2026-09-09", accountId }),
    true,
  );
  assert.equal(
    store.getState().confirmInstallmentPaid(target.id, { date: "2026-09-09", accountId }),
    false,
  );
  assert.equal(store.getState().transactions.length, 37);
  assert.equal(financialSnapshot(store.getState(), "2026-09").plannedOutflow, expense);
  assert.equal(planProgress(store.getState(), target.installmentId).paid, 1);
  assert.equal(planProgress(store.getState(), target.installmentId).remainingAmount, 5400);
  assert.equal(store.getState().confirmInstallmentPaid(target.id, null), true);
  assert.equal(planProgress(store.getState(), target.installmentId).paid, 0);
  assert.equal(store.getState().transactions[0].status, "posted");
  assert.equal(store.getState().transactions[0].accountId, accountId);

  store.getState().clearAll();
  store
    .getState()
    .addInstallmentPlan({
      title: "PARCELAMEN FATURA",
      merchant: "Banco Itaú S.A.",
      kind: "card",
      installmentAmount: 248.43,
      totalCount: 2,
      startDate: "2026-06-04",
      personId: "p-casa",
      category: "contas",
    });
  const planRows = store
    .getState()
    .transactions.slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  const planId = planRows[0].installmentId;
  store
    .getState()
    .addQuickExpense({
      amount: 248.43,
      category: "contas",
      personId: "p-casa",
      description: "Parcelamento de Fatura 01/02",
    });
  const juneMovement = store.getState().transactions[0];
  store
    .getState()
    .updateTransaction(juneMovement.id, {
      date: "2026-06-04",
      nature: "financing",
      installmentId: planId,
    });
  store
    .getState()
    .addQuickExpense({
      amount: 248.43,
      category: "contas",
      personId: "p-casa",
      description: "Parcelamento de Fatura 02/02",
    });
  const julyMovement = store.getState().transactions[0];
  store
    .getState()
    .updateTransaction(julyMovement.id, {
      date: "2026-07-04",
      nature: "financing",
      installmentId: planId,
    });
  assert.equal(store.getState().reconcileInstallment(planRows[0].id, juneMovement.id), true);
  assert.equal(store.getState().reconcileInstallment(planRows[1].id, juneMovement.id), false);
  assert.equal(store.getState().reconcileInstallment(planRows[1].id, julyMovement.id), true);

  console.log(
    "PASS: projection, unique links, different dates, classification ignored, same-plan candidates, manual confirmation, undo, and plan preservation.",
  );
} finally {
  await server.close();
}
