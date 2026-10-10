import { useFinanceStore } from "./store";
import {
  billIdentityKey,
  canonicalInstitution,
  normalizeKeyPart,
  uniqueCardBills,
} from "./bill-identity";
import { bankSummaries } from "./bank/summary-registry";
import type { FinancialDocumentSummary, Transaction } from "./types";

/**
 * Junta os documentos importados com os dados do Open Finance. Para um banco conectado,
 * o saldo do banco substitui o extrato em PDF do mesmo mês, e a fatura do banco
 * substitui a fatura em PDF do mesmo mês.
 */
export function withBankSummaries(
  documents: FinancialDocumentSummary[],
  bank: FinancialDocumentSummary[],
) {
  if (bank.length === 0) return documents;
  // Só o mês do saldo do banco: extratos em PDF de meses anteriores continuam valendo.
  const balanceKey = (s: FinancialDocumentSummary) =>
    `${canonicalInstitution(s.institution)}|${(s.balanceDate ?? s.referenceMonth).slice(0, 7)}`;
  const bankBalances = new Set(bank.filter((s) => s.kind === "bank_statement").map(balanceKey));
  const bankBills = new Set(
    bank
      .filter((s) => s.kind === "credit_card_bill")
      .map((s) => `${canonicalInstitution(s.institution)}|${s.referenceMonth}`),
  );
  const docKey = (doc: FinancialDocumentSummary) =>
    doc.kind === "bank_statement"
      ? `s|${balanceKey(doc)}`
      : `b|${canonicalInstitution(doc.institution)}|${doc.referenceMonth}`;
  const bankKey = (s: FinancialDocumentSummary) =>
    s.kind === "bank_statement"
      ? `s|${balanceKey(s)}`
      : `b|${canonicalInstitution(s.institution)}|${s.referenceMonth}`;
  // PDFs de duas pessoas no mesmo banco e mês (ex.: cartão do casal, só um conectado):
  // não dá para saber qual deles o banco substitui, então ficam os PDFs.
  const holders = new Map<string, Set<string>>();
  for (const doc of documents) {
    const key = docKey(doc);
    holders.set(key, (holders.get(key) ?? new Set()).add(normalizeKeyPart(doc.holderName)));
  }
  const ambiguous = (key: string) => (holders.get(key)?.size ?? 0) > 1;
  const kept = documents.filter((doc) => {
    const key = docKey(doc);
    if (ambiguous(key)) return true;
    return doc.kind === "bank_statement" ? !bankBalances.has(balanceKey(doc)) : !bankBills.has(key.slice(2));
  });
  return [...kept, ...bank.filter((s) => !ambiguous(bankKey(s)))];
}

function monthEnd(key: string) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month, 0, 12, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function summaryAccountKey(summary: FinancialDocumentSummary) {
  return `${canonicalInstitution(summary.institution)}|${normalizeKeyPart(summary.holderName)}`;
}

function paymentInstitution(tx: Transaction) {
  return canonicalInstitution(
    [tx.originInstitution, tx.originLabel, tx.merchant, tx.description].filter(Boolean).join(" "),
  );
}

function isCardPayment(tx: Transaction) {
  if (tx.nature === "card_payment") return true;
  const text = normalizeKeyPart(`${tx.paymentMethod ?? ""} ${tx.merchant} ${tx.description}`);
  return /\bpagamento de fatura\b|\bpagamento fatura\b|\bpag fatura\b|\bpagto fatura\b/.test(text);
}

function sameAmount(a: number, b: number) {
  return Math.abs(a - b) <= 0.05;
}

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function paymentCanBelongToBill(payment: Transaction, bill: FinancialDocumentSummary) {
  if (!isCardPayment(payment) || typeof bill.billTotal !== "number") return false;
  if (!sameAmount(payment.amount, bill.billTotal)) return false;

  const billInstitution = canonicalInstitution(bill.institution);
  const txInstitution = paymentInstitution(payment);
  if (billInstitution && txInstitution && billInstitution !== txInstitution) return false;

  const earliest = `${bill.referenceMonth}-01`;
  const latest = addDays(bill.dueDate ?? monthEnd(bill.referenceMonth), 45);
  return payment.date >= earliest && payment.date <= latest;
}

function uniqueBillsFrom(summaries: FinancialDocumentSummary[]) {
  return uniqueCardBills(
    summaries.filter(
      (summary) =>
        summary.kind === "credit_card_bill" &&
        typeof summary.billTotal === "number" &&
        summary.billTotal > 0,
    ),
  );
}

function reconcilePayments(bills: FinancialDocumentSummary[], transactions: Transaction[]) {
  const payments = transactions
    .filter(isCardPayment)
    .filter((tx) => tx.status === "posted")
    .sort((a, b) => a.date.localeCompare(b.date));
  const used = new Set<string>();
  const paymentByBill = new Map<string, Transaction>();

  const orderedBills = [...bills].sort((a, b) => {
    const aDate = a.dueDate ?? `${a.referenceMonth}-28`;
    const bDate = b.dueDate ?? `${b.referenceMonth}-28`;
    return aDate.localeCompare(bDate);
  });

  for (const bill of orderedBills) {
    const billKey = billIdentityKey(bill);
    const strongCandidates = payments.filter((payment) => {
      if (used.has(payment.id) || !paymentCanBelongToBill(payment, bill)) return false;
      const billInstitution = canonicalInstitution(bill.institution);
      const txInstitution = paymentInstitution(payment);
      return Boolean(billInstitution && txInstitution && billInstitution === txInstitution);
    });

    let chosen = strongCandidates[0];
    if (!chosen) {
      const amountCandidates = payments.filter(
        (payment) => !used.has(payment.id) && paymentCanBelongToBill(payment, bill),
      );
      if (amountCandidates.length === 1) chosen = amountCandidates[0];
    }

    if (!chosen) continue;
    used.add(chosen.id);
    paymentByBill.set(billKey, chosen);
  }

  return paymentByBill;
}

export type CashBillStatus = "paid" | "open" | "future";

export type CashBillRow = {
  institution: string;
  total: number;
  referenceMonth: string;
  dueDate?: string;
  status: CashBillStatus;
  paymentDate?: string;
};

export type CashPosition = {
  cashKnown: boolean;
  cashBalance: number;
  cashSources: number;
  billsKnown: boolean;
  billsDue: number;
  billCount: number;
  paidBillsAmount: number;
  paidBillCount: number;
  futureBillCount: number;
  billRows: CashBillRow[];
  netAvailable: number | null;
};

export function cashPositionForMonth(
  summaries: FinancialDocumentSummary[],
  month: string,
  transactions: Transaction[] = useFinanceStore.getState().transactions,
  bank: FinancialDocumentSummary[] = bankSummaries(),
): CashPosition {
  summaries = withBankSummaries(summaries, bank);
  const end = monthEnd(month);
  const statements = summaries
    .filter(
      (summary) =>
        summary.kind === "bank_statement" &&
        typeof summary.balance === "number" &&
        Boolean(summary.balanceDate) &&
        summary.balanceDate! <= end,
    )
    .sort((a, b) => (b.balanceDate ?? "").localeCompare(a.balanceDate ?? ""));

  const latestByAccount = new Map<string, FinancialDocumentSummary>();
  for (const summary of statements) {
    const key = summaryAccountKey(summary);
    if (!latestByAccount.has(key)) latestByAccount.set(key, summary);
  }

  const selectedStatements = [...latestByAccount.values()].filter((summary) => {
    const date = summary.balanceDate ?? "";
    return date.slice(0, 7) === month || summary.referenceMonth === month;
  });
  const cashBalance = selectedStatements.reduce((sum, summary) => sum + (summary.balance ?? 0), 0);

  const allBills = uniqueBillsFrom(summaries);
  const paymentByBill = reconcilePayments(allBills, transactions);

  const relatedBills = allBills.filter((bill) => {
    const paymentDate = paymentByBill.get(billIdentityKey(bill))?.date ?? bill.paidOn;
    const dueMonth = bill.dueDate?.slice(0, 7);
    return bill.referenceMonth === month || dueMonth === month || paymentDate?.slice(0, 7) === month;
  });

  const billRows: CashBillRow[] = relatedBills
    .map((bill) => {
      const paymentDate = paymentByBill.get(billIdentityKey(bill))?.date ?? bill.paidOn;
      const paidByMonthEnd = Boolean(paymentDate && paymentDate <= end);
      const dueMonth = bill.dueDate?.slice(0, 7) ?? bill.referenceMonth;
      const status: CashBillStatus = paidByMonthEnd
        ? "paid"
        : dueMonth > month
          ? "future"
          : "open";
      return {
        institution: bill.institution,
        total: bill.billTotal ?? 0,
        referenceMonth: bill.referenceMonth,
        dueDate: bill.dueDate,
        status,
        paymentDate: paidByMonthEnd ? paymentDate : undefined,
      };
    })
    .sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"));

  const openBills = billRows.filter(
    (row) => row.status === "open" && (row.dueDate?.slice(0, 7) ?? row.referenceMonth) === month,
  );
  const paidInMonth = billRows.filter(
    (row) => row.status === "paid" && row.paymentDate?.slice(0, 7) === month,
  );
  const futureBills = billRows.filter((row) => row.status === "future");

  const billsDue = openBills.reduce((sum, bill) => sum + bill.total, 0);
  const paidBillsAmount = paidInMonth.reduce((sum, bill) => sum + bill.total, 0);
  const cashKnown = selectedStatements.length > 0;
  const billsKnown = relatedBills.length > 0;

  return {
    cashKnown,
    cashBalance,
    cashSources: selectedStatements.length,
    billsKnown,
    billsDue,
    billCount: openBills.length,
    paidBillsAmount,
    paidBillCount: paidInMonth.length,
    futureBillCount: futureBills.length,
    billRows,
    netAvailable: cashKnown ? cashBalance - billsDue : null,
  };
}
