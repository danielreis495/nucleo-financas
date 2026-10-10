/**
 * Converte o retrato do Open Finance nos tipos que o app já usa (Transaction,
 * Account, InstallmentPlan). Puro e sem dependências de servidor.
 */
import type {
  Account,
  CategoryId,
  FinancialDocumentSummary,
  InstallmentPlan,
  Person,
  Transaction,
  TxNature,
} from "../types";
import { addMonthsKey, todayIso } from "../utils";
import type { BankAccountRow, BankOwnerRole, BankSnapshot, BankTransactionRow } from "./types";

export const BANK_TX_PREFIX = "bank:";

/** Chave estável do estabelecimento, usada nas regras de categoria e nos parcelamentos. */
export function merchantKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bparc(?:ela)?\.?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}\b/g, " ")
    // "1/12" solto ou colado no nome ("DIFERENCI01/12"): é o número da parcela.
    .replace(/\d{1,2}\s*\/\s*\d{1,2}(?!\d)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

const CATEGORY_RULES: [RegExp, CategoryId][] = [
  [/supermarket|grocer|hipermercado|supermercado|mercado/, "mercado"],
  [/restaurant|food delivery|eating out|bakery|coffee|fast food|snack|delivery|food/, "alimentacao"],
  [/gas station|fuel|parking|toll|taxi|ride|uber|transport|mobility|vehicle|automotive|car rental|bicycle/, "transporte"],
  [/streaming|digital service|subscription|software|music|video on demand|online service/, "assinaturas"],
  [/rent|housing|condominium|furniture|home|house|construction|maintenance/, "moradia"],
  [/electricity|water|utilit|internet|telecom|mobile|phone|cable|gas\b|bill|tax|fee|bank fee|insurance/, "contas"],
  [/health|pharmacy|drugstore|hospital|clinic|dentist|medical|fitness|gym|wellness|optic/, "saude"],
  [/education|school|university|college|course|book/, "educacao"],
  [/clothing|apparel|shoes|accessor|fashion/, "vestuario"],
  [/\bpet/, "pets"],
  [/travel|airline|airport|hotel|accommodation|lodging|tourism|flight/, "viagem"],
  [/leisure|entertainment|cinema|theater|game|sport|event|bar\b|night|hobby/, "lazer"],
];

export function mapBankCategory(category: string | null, direction: "DEBIT" | "CREDIT"): CategoryId {
  const text = (category ?? "").toLowerCase();
  if (direction === "CREDIT" && /salary|payroll|wage|income|proventos|salario/.test(text)) {
    return "salario";
  }
  for (const [pattern, id] of CATEGORY_RULES) if (pattern.test(text)) return id;
  return "outros";
}

/** Natureza vinda da própria classificação do banco; o resto fica com as regras do app. */
export function bankNature(row: BankTransactionRow, isCard = false): TxNature | undefined {
  const category = (row.category ?? "").toLowerCase();
  const operation = (row.operationType ?? "").toUpperCase();
  // No cartão, "credit card payment" com débito é parcela de PARCELAMENTO DE FATURA (dívida
  // da fatura antiga sendo paga), não um pagamento recebido: as compras originais já
  // foram contadas, então fica fora do orçamento, mas continua somando na fatura.
  if (isCard && row.direction === "DEBIT" && /credit card payment/.test(category)) {
    return "financing";
  }
  if (operation === "PAGAMENTO_FATURA" || /credit card payment/.test(category)) {
    return "card_payment";
  }
  if (/same person transfer|transfer.*same (owner|person)|own account/.test(category)) {
    return "transfer";
  }
  if (/investment/.test(category)) return "investment";
  if (row.direction === "CREDIT" && /loan|financing|credit contracted/.test(category)) {
    return "financing";
  }
  return undefined;
}

const VALID_NATURES = new Set<TxNature>([
  "budget",
  "transfer",
  "investment",
  "card_payment",
  "financing",
  "neutral",
]);

function personForRole(people: Person[], role: BankOwnerRole) {
  return (
    people.find((person) => person.role === role)?.id ??
    people.find((person) => person.role === "you")?.id ??
    people[0]?.id ??
    "p-you"
  );
}

function cardLabel(account: BankAccountRow) {
  const digits = account.number?.replace(/\D/g, "").slice(-4);
  return `Cartão ${account.institution}${digits ? ` •${digits}` : ""}`;
}

function accountLabel(account: BankAccountRow) {
  return account.subtype === "SAVINGS_ACCOUNT"
    ? `Poupança ${account.institution}`
    : `Conta ${account.institution}`;
}

/**
 * Chave curta e estável de um parcelamento do banco, usada para guardar no servidor
 * que a pessoa removeu esse parcelamento (cabe no campo `tx_id` dos ajustes).
 */
export function hiddenPlanKey(planId: string) {
  let hash = 5381;
  for (let i = 0; i < planId.length; i += 1) hash = ((hash * 33) ^ planId.charCodeAt(i)) >>> 0;
  return `plan:${hash.toString(36)}:${planId.length}`;
}

export const HIDDEN_PLAN_NATURE = "hidden_plan";

/** Dia do mês em que a fatura do cartão fecha, se o banco informou. */
function closingDay(account: BankAccountRow) {
  const day = Number(account.closeDate?.slice(8, 10));
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

/** Mês da fatura (pelo fechamento) em que um gasto do cartão feito nessa data entra. */
function cycleMonth(dateIso: string, account: BankAccountRow) {
  const month = dateIso.slice(0, 7);
  const close = closingDay(account);
  return close && Number(dateIso.slice(8, 10)) > close ? addMonthsKey(month, 1) : month;
}

function validMonth(value: string | null | undefined) {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

/**
 * Mês do gasto de uma fatura. O banco informa a fatura pelo mês de VENCIMENTO; quando o
 * vencimento cai no começo do mês (dia 5, por exemplo), a fatura fechou no mês anterior,
 * que é o mês em que as compras foram feitas.
 */
function closingMonthOfBill(billMonth: string, account: BankAccountRow) {
  const dueDay = Number(account.dueDate?.slice(8, 10) ?? "10");
  return dueDay <= 20 ? addMonthsKey(billMonth, -1) : billMonth;
}

function addDaysIso(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Nome do estabelecimento sem o "01/12" da parcela, para mostrar no parcelamento. */
export function installmentTitle(merchant: string) {
  const title = merchant
    .replace(/\s*\bparc(?:ela)?\.?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}\s*$/i, "")
    .replace(/\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/, "")
    .trim();
  return title || merchant;
}

/** Diferença em meses entre dois meses "AAAA-MM" (b - a). */
function monthsBetween(a: string, b: string) {
  const [ya, ma] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/** Parcelas da mesma compra podem diferir alguns centavos (arredondamento do banco). */
function sameInstallmentAmount(a: number, b: number) {
  return Math.abs(a - b) <= Math.max(0.05, Math.min(a, b) * 0.01);
}

type Candidate = {
  tx: Transaction;
  account: BankAccountRow;
  key: string;
  index: number;
  total: number;
  amount: number;
  /** Mês (fechamento da fatura) em que a parcela foi cobrada. */
  month: string;
  /** O mês veio da fatura informada pelo banco (exato), não de uma data. */
  fromBill: boolean;
  purchaseDate: string | null;
  personId: string;
  category: CategoryId;
};

type Chain = {
  members: Candidate[];
  /** Mês da parcela 1, deduzido das parcelas já vistas. */
  startMonth: string;
  amount: number;
  purchaseDate: string | null;
};

export type BankState = {
  accounts: Account[];
  transactions: Transaction[];
  plans: InstallmentPlan[];
  /** Saldos e faturas no formato dos documentos importados, para o caixa real. */
  summaries: FinancialDocumentSummary[];
};

/**
 * Junta as parcelas que pertencem à mesma compra. Cada compra é uma "corrente":
 * mesmo cartão, mesmo estabelecimento, mesmo número de parcelas, valor igual (com
 * tolerância de centavos) e parcelas em meses coerentes entre si. Duas compras no
 * mesmo lugar (ex.: duas idas à farmácia) ficam em correntes diferentes.
 */
function chainInstallments(candidates: Candidate[]) {
  const buckets = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const bucket = `${candidate.account.id}|${candidate.key}|${candidate.total}`;
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), candidate]);
  }
  const chains: Chain[] = [];
  for (const bucket of buckets.values()) {
    // A ordem segue o mês da parcela. A "data da compra" não serve para separar compras:
    // no Itaú ela repete a data de cada cobrança em vez da data original.
    const ordered = [...bucket].sort(
      (a, b) =>
        a.month.localeCompare(b.month) ||
        a.index - b.index ||
        (a.purchaseDate ?? "").localeCompare(b.purchaseDate ?? ""),
    );
    const local: Chain[] = [];
    for (const candidate of ordered) {
      const start = addMonthsKey(candidate.month, -(candidate.index - 1));
      const fit = local.find(
        (chain) =>
          !chain.members.some((member) => member.index === candidate.index) &&
          // Com o mês vindo da fatura, as parcelas da mesma compra começam no mesmo mês;
          // só a data (menos precisa) ganha um mês de folga.
          Math.abs(monthsBetween(chain.startMonth, start)) <=
            (candidate.fromBill && chain.members.every((member) => member.fromBill) ? 0 : 1) &&
          sameInstallmentAmount(chain.amount, candidate.amount),
      );
      if (fit) {
        fit.members.push(candidate);
        fit.purchaseDate ??= candidate.purchaseDate;
      } else {
        local.push({
          members: [candidate],
          startMonth: start,
          amount: candidate.amount,
          purchaseDate: candidate.purchaseDate,
        });
      }
    }
    chains.push(...local);
  }
  // O início vem da parcela de menor número já vista (a mais confiável).
  for (const chain of chains) {
    const first = chain.members.reduce((a, b) => (b.index < a.index ? b : a));
    chain.startMonth = addMonthsKey(first.month, -(first.index - 1));
  }
  return chains;
}

export function buildBankState(
  snapshot: BankSnapshot,
  people: Person[],
  today: string = todayIso(),
): BankState {
  const accountById = new Map(snapshot.accounts.map((account) => [account.id, account]));
  const overrides = new Map(snapshot.overrides.map((item) => [item.txId, item]));
  const rules = new Map(snapshot.rules.map((rule) => [rule.merchantKey, rule.category]));
  const hiddenPlans = new Set(
    snapshot.overrides
      .filter((item) => item.nature === HIDDEN_PLAN_NATURE)
      .map((item) => item.txId),
  );
  const transactions: Transaction[] = [];
  const candidates: Candidate[] = [];

  const accounts: Account[] = snapshot.accounts
    .filter((account) => account.type === "BANK")
    .map((account) => ({
      id: `${BANK_TX_PREFIX}${account.id}`,
      name: accountLabel(account),
      type: account.subtype === "SAVINGS_ACCOUNT" ? "savings" : "checking",
      institution: account.institution,
      // Saldo real informado pelo banco. A data de criação é a da sincronização, então
      // nenhum movimento anterior é somado de novo por cima dele.
      openingBalance: account.balance ?? 0,
      createdAt: account.updatedAt,
      active: true,
    }));

  for (const row of snapshot.transactions) {
    const account = accountById.get(row.accountId);
    if (!account) continue;
    const isCard = account.type === "CREDIT";
    const merchant = (row.merchant || row.description || "Sem descrição").trim();
    const key = merchantKey(merchant);
    const override = overrides.get(row.id);
    const type = row.direction === "CREDIT" ? "income" : "expense";
    const overrideNature =
      override?.nature && VALID_NATURES.has(override.nature as TxNature)
        ? (override.nature as TxNature)
        : undefined;
    const category =
      override?.category ??
      rules.get(key) ??
      // Estorno no cartão herda a categoria de gasto, não "entrada".
      mapBankCategory(row.category, isCard ? "DEBIT" : row.direction);
    const personId = override?.personId ?? personForRole(people, account.ownerRole);
    const index = row.installmentNumber ?? 0;
    const total = row.installmentTotal ?? 0;
    const installment = isCard && type === "expense" && total > 1 && index >= 1 && index <= total;
    // Cartão: a compra conta no mês em que a fatura FECHA (o mês do gasto). Compra feita
    // depois do dia de fechamento já entra na fatura do mês seguinte. Parcela N cai N-1
    // meses depois da compra.
    const purchaseDate =
      row.purchaseDate && /^\d{4}-\d{2}-\d{2}/.test(row.purchaseDate) ? row.purchaseDate : null;
    const competenceMonth = isCard
      ? validMonth(row.billMonth)
        ? closingMonthOfBill(row.billMonth!, account)
        : installment && purchaseDate
          ? addMonthsKey(cycleMonth(purchaseDate, account), index - 1)
          : cycleMonth(row.date, account)
      : undefined;
    // O banco já envia as parcelas futuras como "pendentes". Parcela 2 em diante de uma
    // fatura que ainda vai fechar depois deste mês é previsão, não gasto feito.
    const futureInstallment =
      installment &&
      index > 1 &&
      (row.status ?? "").toUpperCase() === "PENDING" &&
      Boolean(competenceMonth && competenceMonth > today.slice(0, 7));

    const tx: Transaction = {
      id: `${BANK_TX_PREFIX}${row.id}`,
      date: row.date,
      description: row.description || merchant,
      merchant,
      amount: Math.abs(row.amount),
      type,
      nature: overrideNature ?? bankNature(row, isCard),
      natureLocked: Boolean(overrideNature),
      status: futureInstallment ? "scheduled" : "posted",
      category,
      personId,
      accountId: isCard ? null : `${BANK_TX_PREFIX}${account.id}`,
      split: null,
      installmentId: null,
      installmentIndex: null,
      installmentTotal: null,
      source: "bank",
      originLabel: isCard ? cardLabel(account) : accountLabel(account),
      originInstitution: account.institution,
      originKind: isCard ? "credit_card" : "bank_account",
      paymentMethod: isCard ? "Cartão de crédito" : (row.operationType ?? "Conta"),
      competenceMonth,
      createdAt: row.createdAt ?? `${row.date}T12:00:00.000Z`,
    };

    if (installment && competenceMonth) {
      candidates.push({
        tx,
        account,
        key,
        index,
        total,
        amount: Math.abs(row.amount),
        month: competenceMonth,
        fromBill: validMonth(row.billMonth),
        purchaseDate,
        personId,
        category,
      });
    }
    transactions.push(tx);
  }

  const currentMonth = today.slice(0, 7);
  const plans: InstallmentPlan[] = [];
  const dropped = new Set<string>();
  for (const chain of chainInstallments(candidates)) {
    const first = chain.members[0];
    const { account, total } = first;
    // Mesmo formato de id das versões anteriores, para que parcelamentos já excluídos
    // continuem excluídos.
    // A data da compra só identifica o parcelamento quando todas as parcelas concordam
    // (Nubank); no Itaú ela muda a cada parcela, então vale o mês de início.
    const cents = Math.round(chain.amount * 100);
    const dates = new Set(chain.members.map((member) => member.purchaseDate));
    const anchor = dates.size === 1 && chain.purchaseDate ? chain.purchaseDate : chain.startMonth;
    const planId = `bank-plan:${account.id}:${first.key}:${total}:${cents}:${anchor}`;
    if (hiddenPlans.has(hiddenPlanKey(planId))) {
      // Parcelamento excluído: as compras reais ficam; as parcelas futuras enviadas pelo
      // banco somem junto, como prometido na exclusão.
      for (const member of chain.members) if (member.tx.status === "scheduled") dropped.add(member.tx.id);
      continue;
    }

    const latest = chain.members.reduce((a, b) => (b.index > a.index ? b : a));
    const title = installmentTitle(latest.tx.merchant);
    const dueDay = account.dueDate?.slice(8, 10) ?? "10";
    const dueMonthOf = (month: string) =>
      Number(dueDay) <= 20 ? addMonthsKey(month, 1) : month;
    for (const member of chain.members) {
      member.tx.installmentId = planId;
      member.tx.installmentIndex = member.index;
      member.tx.installmentTotal = total;
      member.tx.description = `${title} ${member.index}/${total}`;
      // Parcela futura enviada pelo banco: mostra o vencimento da fatura em que vai cair.
      if (member.tx.status === "scheduled") member.tx.date = `${dueMonthOf(member.month)}-${dueDay}`;
    }

    plans.push({
      id: planId,
      title,
      merchant: title,
      kind: "card",
      installmentAmount: chain.amount,
      totalCount: total,
      startDate: `${chain.startMonth}-01`,
      personId: latest.personId,
      category: latest.category,
      account: cardLabel(account),
      importedCurrentIndex: Math.min(...chain.members.map((member) => member.index)),
      source: "bank",
    });

    // Parcelas que o banco não enviou: as de meses futuros viram previsão; as de meses
    // que já passaram foram cobradas fora da janela recebida e não viram "próxima".
    const known = new Set(chain.members.map((member) => member.index));
    for (let n = 1; n <= total; n += 1) {
      if (known.has(n)) continue;
      const month = addMonthsKey(chain.startMonth, n - 1);
      if (month < currentMonth) continue;
      transactions.push({
        ...latest.tx,
        id: `${planId}:${n}`,
        date: `${dueMonthOf(month)}-${dueDay}`,
        description: `${title} ${n}/${total}`,
        amount: chain.amount,
        status: "scheduled",
        installmentIndex: n,
        competenceMonth: month,
        createdAt: latest.tx.createdAt,
      });
    }
  }

  const kept = dropped.size ? transactions.filter((t) => !dropped.has(t.id)) : transactions;
  const summaries = bankCashSummaries(snapshot, kept, currentMonth);
  return { accounts, transactions: kept, plans, summaries };
}

/**
 * Saldo de cada conta e fatura de cada cartão, como se fossem documentos importados.
 * A fatura vem do banco quando ele informa o total; senão é somada a partir das compras
 * do cartão daquele mês (gastos menos estornos, sem os pagamentos da fatura).
 */
function bankCashSummaries(
  snapshot: BankSnapshot,
  transactions: Transaction[],
  currentMonth: string,
): FinancialDocumentSummary[] {
  const summaries: FinancialDocumentSummary[] = [];
  for (const account of snapshot.accounts) {
    if (account.type === "BANK") {
      if (typeof account.balance !== "number") continue;
      summaries.push({
        id: `${BANK_TX_PREFIX}balance:${account.id}`,
        kind: "bank_statement",
        institution: account.institution,
        holderName: accountLabel(account),
        importedAt: account.updatedAt,
        referenceMonth: account.updatedAt.slice(0, 7),
        balance: account.balance,
        balanceDate: account.updatedAt.slice(0, 10),
      });
      continue;
    }

    const dueDay = account.dueDate?.slice(8, 10) ?? "10";
    const dueNextMonth = Number(dueDay) <= 20;
    const fromBank = (snapshot.bills ?? []).filter(
      (bill) => bill.accountId === account.id && bill.dueDate && typeof bill.totalAmount === "number",
    );
    const bankDueMonths = new Set(fromBank.map((bill) => bill.dueDate!.slice(0, 7)));
    for (const bill of fromBank) {
      summaries.push({
        id: `${BANK_TX_PREFIX}bill:${bill.id}`,
        kind: "credit_card_bill",
        institution: account.institution,
        holderName: cardLabel(account),
        importedAt: account.updatedAt,
        referenceMonth: dueNextMonth
          ? addMonthsKey(bill.dueDate!.slice(0, 7), -1)
          : bill.dueDate!.slice(0, 7),
        billTotal: bill.totalAmount!,
        dueDate: bill.dueDate!,
      });
    }

    // Fatura que vence neste mês (já fechada) e a que está aberta agora.
    const label = cardLabel(account);
    const usedPayments = new Set<string>();
    for (const spendMonth of [addMonthsKey(currentMonth, -1), currentMonth]) {
      const dueMonth = dueNextMonth ? addMonthsKey(spendMonth, 1) : spendMonth;
      if (bankDueMonths.has(dueMonth)) continue;
      const isPayment = (t: Transaction) => t.type === "income" && t.nature === "card_payment";
      const rows = transactions.filter(
        (t) =>
          t.originLabel === label &&
          t.status === "posted" &&
          t.competenceMonth === spendMonth &&
          !isPayment(t),
      );
      const total =
        Math.round(
          rows.reduce((sum, t) => sum + (t.type === "expense" ? t.amount : -t.amount), 0) * 100,
        ) / 100;
      if (total <= 0) continue;
      // Pagamento recebido no cartão entre o fechamento e alguns dias depois do vencimento.
      // Só conta como fatura paga se os pagamentos cobrirem quase todo o valor: pagamento
      // mínimo ou entrada de parcelamento não quitam a fatura. Um pagamento não é usado
      // para duas faturas.
      const dueDate = `${dueMonth}-${dueDay}`;
      const payments = transactions
        .filter(
          (t) =>
            t.originLabel === label &&
            isPayment(t) &&
            !usedPayments.has(t.id) &&
            t.date >= `${spendMonth}-15` &&
            t.date <= addDaysIso(dueDate, 10),
        )
        .sort((a, b) => a.date.localeCompare(b.date));
      let covered = 0;
      let paidOn: string | undefined;
      for (const payment of payments) {
        if (covered >= total * 0.8) break;
        covered += payment.amount;
        usedPayments.add(payment.id);
        paidOn = payment.date;
      }
      const payment = covered >= total * 0.8 ? { date: paidOn! } : undefined;
      summaries.push({
        id: `${BANK_TX_PREFIX}bill:${account.id}:${dueMonth}`,
        kind: "credit_card_bill",
        institution: account.institution,
        holderName: label,
        importedAt: account.updatedAt,
        // Mesmo critério das faturas em PDF: o mês de referência é o do fechamento.
        referenceMonth: spendMonth,
        billTotal: total,
        dueDate,
        paidOn: payment?.date,
      });
    }
  }
  return summaries;
}

/** Bancos conectados, para mostrar no app. */
export function connectedInstitutions(snapshot: BankSnapshot) {
  return [...new Set(snapshot.accounts.map((account) => account.institution))];
}
