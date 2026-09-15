import assert from "node:assert/strict";
import { createServer } from "vite";

// Isolated in-memory store; no production data or network requests.
const server = await createServer({ configFile: false, server: { middlewareMode: true }, appType: "custom" });
try {
  const { useFinanceStore: store } = await server.ssrLoadModule("/src/lib/store.ts");
  const { financialSnapshot, planProgress } = await server.ssrLoadModule("/src/lib/selectors.ts");
  store.getState().clearAll();
  store.getState().addPlannedIncome({ label: "Entrada prevista", amount: 1000, date: "2026-09-25" });
  store.getState().addInstallmentPlan({ title: "Dívida", merchant: "Credor", kind: "loan", installmentAmount: 200, totalCount: 2, startDate: "2026-09-15", personId: "p-you", category: "outros" });
  const first = store.getState().transactions[0];
  assert.equal(first.status, "scheduled");
  store.getState().advanceDueInstallments();
  assert.equal(store.getState().transactions[0].status, "scheduled");
  const snapshot = financialSnapshot(store.getState(), "2026-09");
  assert.equal(snapshot.receivedIncome, 0);
  assert.equal(snapshot.expectedIncome, 1000);
  assert.equal(snapshot.margin, 800);
  assert.equal(planProgress(store.getState(), first.installmentId).paid, 0);
  store.getState().addQuickExpense({ amount: 200, category: "outros", personId: "p-you", description: "Pagamento" });
  const payment = store.getState().transactions[0];
  store.getState().updateTransaction(payment.id, { date: "2026-09-15" });
  assert.equal(store.getState().reconcileInstallment(first.id, payment.id), true);
  assert.equal(financialSnapshot(store.getState(), "2026-09").plannedOutflow, 200);
  assert.equal(planProgress(store.getState(), first.installmentId).paid, 1);
  const other = store.getState().transactions.find((row) => row.installmentId && row.id !== first.id);
  assert.equal(store.getState().reconcileInstallment(other.id, payment.id), false);
  assert.equal(store.getState().reconcileInstallment(first.id, null), true);
  assert.equal(planProgress(store.getState(), first.installmentId).paid, 0);
  assert.equal(store.getState().reconcileInstallment(first.id, payment.id), true);
  store.getState().removeTransaction(payment.id);
  assert.equal(planProgress(store.getState(), first.installmentId).paid, 0);
  assert.equal(store.getState().transactions.find((row) => row.id === first.id).reconciliationHistory.length, 4);
  console.log("PASS: projected income, due date, reconciliation, duplicate guard, undo, deletion invalidation.");
} finally { await server.close(); }
