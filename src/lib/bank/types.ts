/** Formatos trocados entre o servidor (Neon) e o app. Sem dependências de servidor. */

export type BankOwnerRole = "you" | "partner";

export type BankAccountRow = {
  id: string;
  itemId: string;
  ownerRole: BankOwnerRole;
  type: "BANK" | "CREDIT";
  subtype: string | null;
  name: string;
  number: string | null;
  institution: string;
  balance: number | null;
  creditLimit: number | null;
  availableLimit: number | null;
  dueDate: string | null;
  closeDate: string | null;
  updatedAt: string;
};

export type BankTransactionRow = {
  id: string;
  accountId: string;
  date: string;
  description: string;
  merchant: string | null;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  status: string | null;
  category: string | null;
  operationType: string | null;
  installmentNumber: number | null;
  installmentTotal: number | null;
  purchaseDate: string | null;
  billMonth: string | null;
  createdAt: string | null;
};

export type BankOverride = {
  txId: string;
  category: string | null;
  personId: string | null;
  nature: string | null;
};

export type BankMerchantRule = { merchantKey: string; category: string };

export type BankSyncInfo = {
  at: string;
  trigger: string;
  ok: boolean;
  message: string | null;
  transactions: number | null;
};

export type BankItemInfo = {
  itemId: string;
  /** Situação da conexão na Pluggy: UPDATED, UPDATING, LOGIN_ERROR, OUTDATED… */
  status: string | null;
  executionStatus?: string | null;
  /** Código e texto do erro que a Pluggy informa quando a conexão falha. */
  errorCode?: string | null;
  errorMessage?: string | null;
  /** Quando a autorização do Open Finance vence. */
  consentExpiresAt?: string | null;
  /** Quando a Pluggy buscou os dados no banco pela última vez. */
  lastUpdatedAt: string | null;
  /** Último pedido de atualização feito pelo botão e o que a Pluggy respondeu ("ok" ou o motivo). */
  updateRequestedAt?: string | null;
  updateResult?: string | null;
};

export type BankBillRow = {
  id: string;
  accountId: string;
  dueDate: string | null;
  closeDate: string | null;
  totalAmount: number | null;
};

export type BankSnapshot = {
  accounts: BankAccountRow[];
  items?: BankItemInfo[];
  /** Faturas fechadas informadas pelo banco (quando o banco envia). */
  bills?: BankBillRow[];
  transactions: BankTransactionRow[];
  overrides: BankOverride[];
  rules: BankMerchantRule[];
  lastSync: BankSyncInfo | null;
  lastSuccessAt: string | null;
};

export type BankSyncResult = { ok: boolean; transactions: number; errors: string[] };

export type BankEditInput = {
  /** Id da transação na Pluggy (sem o prefixo `bank:`). */
  txId: string;
  category?: string;
  personId?: string;
  nature?: string;
  /** Quando informado com `category`, as próximas compras desse estabelecimento seguem a mesma categoria. */
  merchantKey?: string;
};
