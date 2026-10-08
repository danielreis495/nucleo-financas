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
import { addMonthsKey } from "../utils";
import type { BankAccountRow, BankOwnerRole, BankSnapshot, BankTransactionRow } from "./types";

export const BANK_TX_PREFIX = "bank:";

/** Chave estável do estabelecimento, usada nas regras de categoria e nos parcelamentos. */
export function merchantKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bparc(?:ela)?\.?\s*\d{1,2}\s*(?:\/|de)\s*\d{1,2}\b/g, " ")
    .replace(/\b\d{1,2}\s*\/\s*\d{1,2}\b/g, " ")
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

type PlanGroup = {
  id: string;
  title: string;
  merchant: string;
  amount: number;
  total: number;
  startMonth: string;
  /** O início foi calculado pela data da compra (mais confiável que a data da linha). */
  startFromPurchase: boolean;
  minIndex: number;
  maxIndex: number;
  personId: string;
  category: CategoryId;
  account: BankAccountRow;
  sample: Transaction;
};

export type BankState = {
  accounts: Account[];
  transactions: Transaction[];
  plans: InstallmentPlan[];
};

export function buildBankState(snapshot: BankSnapshot, people: Person[]): BankState {
  const accountById = new Map(snapshot.accounts.map((account) => [account.id, account]));
  const overrides = new Map(snapshot.overrides.map((item) => [item.txId, item]));
  const rules = new Map(snapshot.rules.map((rule) => [rule.merchantKey, rule.category]));
  const groups = new Map<string, PlanGroup>();
  const hiddenPlans = new Set(
    snapshot.overrides
      .filter((item) => item.nature === HIDDEN_PLAN_NATURE)
      .map((item) => item.txId),
  );
  const transactions: Transaction[] = [];

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
      const fromPurchase = Boolean(purchaseDate);
      const startMonth = addMonthsKey(competenceMonth, -(index - 1));
      const cents = Math.round(Math.abs(row.amount) * 100);
      // Todas as parcelas da mesma compra têm a mesma data de compra. Quando o banco
      // informa essa data, ela identifica o parcelamento; sem ela, o mês de início
      // calculado faz esse papel. Assim uma compra não vira vários parcelamentos.
      const planId = purchaseDate
        ? `bank-plan:${account.id}:${key}:${total}:${cents}:${purchaseDate}`
        : `bank-plan:${account.id}:${key}:${total}:${cents}:${startMonth}`;
      if (!hiddenPlans.has(hiddenPlanKey(planId))) {
        tx.installmentId = planId;
        tx.installmentIndex = index;
        tx.installmentTotal = total;
        const group = groups.get(planId);
        if (group) {
          if (fromPurchase && !group.startFromPurchase) {
            group.startMonth = startMonth;
            group.startFromPurchase = true;
          } else if (fromPurchase === group.startFromPurchase && startMonth < group.startMonth) {
            group.startMonth = startMonth;
          }
          group.minIndex = Math.min(group.minIndex, index);
          if (index >= group.maxIndex) {
            group.maxIndex = index;
            group.sample = tx;
          }
        } else {
          groups.set(planId, {
            id: planId,
            title: merchant,
            merchant,
            amount: Math.abs(row.amount),
            total,
            startMonth,
            startFromPurchase: fromPurchase,
            minIndex: index,
            maxIndex: index,
            personId,
            category,
            account,
            sample: tx,
          });
        }
      }
    }
    transactions.push(tx);
  }

  const plans: InstallmentPlan[] = [];
  for (const group of groups.values()) {
    plans.push({
      id: group.id,
      title: group.title,
      merchant: group.merchant,
      kind: "card",
      installmentAmount: group.amount,
      totalCount: group.total,
      startDate: `${group.startMonth}-01`,
      personId: group.personId,
      category: group.category,
      account: cardLabel(group.account),
      importedCurrentIndex: group.minIndex,
      source: "bank",
    });

    // Parcelas que ainda vão cair nas próximas faturas, para a previsão do mês.
    // O mês da parcela é o do fechamento; a data mostrada é o vencimento dessa fatura,
    // que cai no mês seguinte quando o vencimento é antes do dia de fechamento.
    const dueDay = group.account.dueDate?.slice(8, 10) ?? "10";
    const close = closingDay(group.account);
    const dueNextMonth = close !== null && Number(dueDay) < close;
    for (let n = group.maxIndex + 1; n <= group.total; n += 1) {
      const month = addMonthsKey(group.startMonth, n - 1);
      const dueMonth = dueNextMonth ? addMonthsKey(month, 1) : month;
      transactions.push({
        ...group.sample,
        id: `${group.id}:${n}`,
        date: `${dueMonth}-${dueDay}`,
        description: `${group.title} ${n}/${group.total}`,
        amount: group.amount,
        status: "scheduled",
        installmentIndex: n,
        competenceMonth: month,
        createdAt: group.sample.createdAt,
      });
    }
  }

  return { accounts, transactions, plans };
}

/** Bancos conectados, para mostrar no app. */
export function connectedInstitutions(snapshot: BankSnapshot) {
  return [...new Set(snapshot.accounts.map((account) => account.institution))];
}
