import type { FinancialDocumentSummary, Transaction } from "./types";

function monthEnd(key: string) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month, 0, 12, 0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalizeKeyPart(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalInstitution(value: string | undefined) {
  const text = normalizeKeyPart(value);
  if (/\bnubank\b|\bnu pagamentos\b/.test(text)) return "nubank";
  if (/\bitau\b/.test(text)) return "itau";
  if (/\bbradesco\b/.test(text)) return "bradesco";
  if (/\bsantander\b/.test(text)) return "santander";
  if (/\bbanco do brasil\b/.test(text)) return "banco do brasil";
  if (/\bcaixa economica\b|\bcaixa\b/.test(text)) return "caixa";
  if (/\bbanco inter\b|\binter\b/.test(text)) return "inter";
  if (/\bc6 bank\b|\bc6\b/.test(text)) return "c6";
  return text;
}

function summaryAccountKey(summary: FinancialDocumentSummary) {
  return `${canonicalInstitution(summary.institution)}|${normalizeKeyPart(summary.holderName)}`;
}

function billIdentityKey(summary: FinancialDocumentSummary) {
  return [canonicalInstitution(summary.institution), summary.referenceMonth].join("|");
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
  const bills = summaries
    .filter(
      (summary) =>
        summary.kind === "credit_card_bill" &&
        typeof summary.billTotal === "number" &&
        summary.billTotal > 0,
    )
    .sort((a, b) => (b.importedAt ?? "").localeCompare(a.importedAt ?? ""));

  const map = new Map<string, FinancialDocumentSummary>();
  for (const bill of bills) {
    const key = billIdentityKey(bill);
    if (!map.has(key)) map.set(key, bill);
  }
  return [...map.values()];
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
      // Sem instituição reconhecida, só conciliamos se o valor/data apontarem para
      // uma única possibilidade. É melhor deixar em aberto do que adivinhar.
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
  transactions: Transaction[] = [],
): CashPosition {
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
    const payment = paymentByBill.get(billIdentityKey(bill));
    const dueMonth = bill.dueDate?.slice(0, 7);
    return bill.referenceMonth === month || dueMonth === month || payment?.date.slice(0, 7) === month;
  });

  const billRows: CashBillRow[] = relatedBills
    .map((bill) => {
      const payment = paymentByBill.get(billIdentityKey(bill));
      const paidByMonthEnd = Boolean(payment && payment.date <= end);
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
        paymentDate: paidByMonthEnd ? payment?.date : undefined,
      };
    })
    .sort((a, b) => (a.dueDate ?? "9999-12-31").localeCompare(b.dueDate ?? "9999-12-31"));

  // Caixa segue o mês em que a obrigação vence/pesa no dinheiro, e não o mês de
  // competência das compras. Uma fatura de agosto que vence em setembro não é
  // descontada do caixa de agosto. Se foi paga antecipadamente em agosto, o saldo
  // final do extrato já reflete esse pagamento e também não deve ser descontada de novo.
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
