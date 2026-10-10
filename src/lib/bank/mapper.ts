/**
 * Converte o retrato do Open Finance nos tipos que o app já usa (Transaction,
 * Account, InstallmentPlan). Puro e sem dependências de servidor.
 */
import type {
  Account,
  CategoryId,
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
export function bankNature(row: BankTransactionRow): TxNature | undefined {
  const category = (row.category ?? "").toLowerCase();
  const operation = (row.operationType ?? "").toUpperCase();
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
    const ordered = [...bucket].sort(
      (a, b) =>
        (a.purchaseDate ?? "").localeCompare(b.purchaseDate ?? "") ||
        a.month.localeCompare(b.month) ||
        a.index - b.index,
    );
    const local: Chain[] = [];
    for (const candidate of ordered) {
      const start = addMonthsKey(candidate.month, -(candidate.index - 1));
      const fit = local.find(
        (chain) =>
          !chain.members.some((member) => member.index === candidate.index) &&
          Math.abs(monthsBetween(chain.startMonth, start)) <= 1 &&
          sameInstallmentAmount(chain.amount, candidate.amount) &&
          (!chain.purchaseDate || !candidate.purchaseDate || chain.purchaseDate === candidate.purchaseDate),
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
      ? installment && purchaseDate
        ? addMonthsKey(cycleMonth(purchaseDate, account), index - 1)
        : cycleMonth(row.date, account)
      : undefined;

    const tx: Transaction = {
      id: `${BANK_TX_PREFIX}${row.id}`,
      date: row.date,
      description: row.description || merchant,
      merchant,
      amount: Math.abs(row.amount),
      type,
      nature: overrideNature ?? bankNature(row),
      natureLocked: Boolean(overrideNature),
      status: "posted",
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
        purchaseDate,
        personId,
        category,
      });
    }
    transactions.push(tx);
  }

  const currentMonth = today.slice(0, 7);
  const plans: InstallmentPlan[] = [];
  for (const chain of chainInstallments(candidates)) {
    const first = chain.members[0];
    const { account, total } = first;
    // Mesmo formato de id das versões anteriores, para que parcelamentos já excluídos
    // continuem excluídos.
    const cents = Math.round(chain.amount * 100);
    const planId = `bank-plan:${account.id}:${first.key}:${total}:${cents}:${chain.purchaseDate ?? chain.startMonth}`;
    if (hiddenPlans.has(hiddenPlanKey(planId))) continue;

    const latest = chain.members.reduce((a, b) => (b.index > a.index ? b : a));
    const title = installmentTitle(latest.tx.merchant);
    for (const member of chain.members) {
      member.tx.installmentId = planId;
      member.tx.installmentIndex = member.index;
      member.tx.installmentTotal = total;
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

    // Parcelas que ainda vão cair nas próximas faturas, para a previsão. Uma parcela de
    // um mês que já passou e não veio do banco não é "próxima": ela já foi cobrada fora
    // da janela que o banco enviou, então não vira previsão no passado.
    // O mês da parcela é o do fechamento; a data mostrada é o vencimento dessa fatura,
    // que cai no mês seguinte quando o vencimento é antes do dia de fechamento.
    const dueDay = account.dueDate?.slice(8, 10) ?? "10";
    const close = closingDay(account);
    const dueNextMonth = close !== null && Number(dueDay) < close;
    for (let n = latest.index + 1; n <= total; n += 1) {
      const month = addMonthsKey(chain.startMonth, n - 1);
      if (month < currentMonth) continue;
      const dueMonth = dueNextMonth ? addMonthsKey(month, 1) : month;
      transactions.push({
        ...latest.tx,
        id: `${planId}:${n}`,
        date: `${dueMonth}-${dueDay}`,
        description: `${title} ${n}/${total}`,
        amount: chain.amount,
        status: "scheduled",
        installmentIndex: n,
        competenceMonth: month,
        createdAt: latest.tx.createdAt,
      });
    }
  }

  return { accounts, transactions, plans };
}

/** Bancos conectados, para mostrar no app. */
export function connectedInstitutions(snapshot: BankSnapshot) {
  return [...new Set(snapshot.accounts.map((account) => account.institution))];
}
