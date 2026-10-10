/**
 * Sincronização Pluggy -> Neon e leitura do retrato usado pelo app.
 * Somente servidor: importe apenas de dentro de handlers (createServerFn / rotas de API).
 */
import { getSql, type Sql } from "../db";
import { configuredItems, credentialsFor, type BankItemConfig } from "./config";
import {
  createApiKey,
  getItem,
  listAccounts,
  listBills,
  listTransactions,
  requestItemUpdate,
  type PluggyAccount,
  type PluggyTransaction,
} from "./pluggy";
import type {
  BankAccountRow,
  BankBillRow,
  BankEditInput,
  BankItemInfo,
  BankMerchantRule,
  BankOverride,
  BankSnapshot,
  BankSyncInfo,
  BankSyncResult,
  BankTransactionRow,
} from "./types";

const DAY = 86_400_000;
/** Primeira carga: o Open Finance costuma liberar até 12 meses de histórico. */
const FIRST_SYNC_DAYS = 400;
/** Cargas seguintes: relê uma janela recente para pegar compras que mudaram de status. */
const NEXT_SYNC_DAYS = 75;

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function dayOrNull(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null;
}

function institutionFrom(accounts: PluggyAccount[]) {
  const text = accounts
    .map((account) => `${account.name ?? ""} ${account.marketingName ?? ""}`)
    .join(" ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/\bnu pagamentos\b|\bnubank\b/.test(text)) return "Nubank";
  if (/\bitau\b/.test(text)) return "Itaú";
  if (/\binter\b/.test(text)) return "Inter";
  if (/\bbradesco\b/.test(text)) return "Bradesco";
  if (/\bsantander\b/.test(text)) return "Santander";
  if (/\bcaixa\b/.test(text)) return "Caixa";
  if (/\bbanco do brasil\b/.test(text)) return "Banco do Brasil";
  if (/\bc6\b/.test(text)) return "C6 Bank";
  if (/\bpicpay\b/.test(text)) return "PicPay";
  if (/\bmercado pago\b/.test(text)) return "Mercado Pago";
  return accounts.find((account) => account.type === "BANK")?.name?.trim() || "Banco";
}

async function upsertAccount(
  sql: Sql,
  item: BankItemConfig,
  institution: string,
  account: PluggyAccount,
) {
  const credit = account.creditData ?? null;
  await sql`
    insert into bank_accounts (
      id, item_id, owner_role, type, subtype, name, number, institution, balance,
      credit_limit, available_limit, due_date, close_date, updated_at
    ) values (
      ${account.id}, ${item.itemId}, ${item.ownerRole}, ${account.type}, ${account.subtype ?? null},
      ${account.marketingName || account.name || "Conta"}, ${account.number ?? null}, ${institution},
      ${account.balance ?? null}, ${credit?.creditLimit ?? null}, ${credit?.availableCreditLimit ?? null},
      ${dayOrNull(credit?.balanceDueDate)}, ${dayOrNull(credit?.balanceCloseDate)}, now()
    )
    on conflict (id) do update set
      item_id = excluded.item_id,
      owner_role = excluded.owner_role,
      type = excluded.type,
      subtype = excluded.subtype,
      name = excluded.name,
      number = excluded.number,
      institution = excluded.institution,
      balance = excluded.balance,
      credit_limit = excluded.credit_limit,
      available_limit = excluded.available_limit,
      due_date = excluded.due_date,
      close_date = excluded.close_date,
      updated_at = now()
  `;
}

function transactionRecord(tx: PluggyTransaction, billMonthById: Map<string, string>) {
  const meta = tx.creditCardMetadata ?? null;
  const billMonth =
    (meta?.billForecastDate && /^\d{4}-\d{2}/.test(meta.billForecastDate)
      ? meta.billForecastDate.slice(0, 7)
      : null) ?? (meta?.billId ? (billMonthById.get(meta.billId) ?? null) : null);
  return {
    id: tx.id,
    account_id: tx.accountId,
    date: tx.date.slice(0, 10),
    description: (tx.description || tx.descriptionRaw || "").trim(),
    merchant: (tx.merchant?.name || tx.merchant?.businessName || "").trim() || null,
    amount: Math.abs(Number(tx.amount) || 0),
    direction: tx.type === "CREDIT" ? "CREDIT" : "DEBIT",
    status: tx.status ?? null,
    category: tx.category ?? null,
    operation_type: tx.operationType ?? null,
    installment_number: meta?.installmentNumber ?? null,
    installment_total: meta?.totalInstallments ?? null,
    purchase_date: dayOrNull(meta?.purchaseDate),
    bill_id: meta?.billId ?? null,
    bill_month: billMonth,
    provider_created_at: tx.createdAt ?? null,
  };
}

async function upsertTransactions(sql: Sql, records: ReturnType<typeof transactionRecord>[]) {
  // Lotes para não estourar o tamanho de um único parâmetro JSON.
  for (let start = 0; start < records.length; start += 500) {
    const batch = records.slice(start, start + 500);
    await sql.query(
      `insert into bank_transactions (
         id, account_id, date, description, merchant, amount, direction, status, category,
         operation_type, installment_number, installment_total, purchase_date, bill_id,
         bill_month, provider_created_at, synced_at
       )
       select id, account_id, date, description, merchant, amount, direction, status, category,
              operation_type, installment_number, installment_total, purchase_date, bill_id,
              bill_month, provider_created_at, now()
       from jsonb_to_recordset($1::jsonb) as x(
         id text, account_id text, date date, description text, merchant text, amount numeric,
         direction text, status text, category text, operation_type text,
         installment_number integer, installment_total integer, purchase_date date,
         bill_id text, bill_month text, provider_created_at timestamptz
       )
       on conflict (id) do update set
         account_id = excluded.account_id,
         date = excluded.date,
         description = excluded.description,
         merchant = excluded.merchant,
         amount = excluded.amount,
         direction = excluded.direction,
         status = excluded.status,
         category = excluded.category,
         operation_type = excluded.operation_type,
         installment_number = excluded.installment_number,
         installment_total = excluded.installment_total,
         purchase_date = excluded.purchase_date,
         bill_id = excluded.bill_id,
         bill_month = excluded.bill_month,
         provider_created_at = excluded.provider_created_at,
         synced_at = now()`,
      [JSON.stringify(batch)],
    );
  }
}

async function syncAccount(sql: Sql, apiKey: string, account: PluggyAccount) {
  const existing = await sql<{ has: boolean }>`
    select exists(select 1 from bank_transactions where account_id = ${account.id}) as has
  `;
  const days = existing[0]?.has ? NEXT_SYNC_DAYS : FIRST_SYNC_DAYS;
  const from = isoDay(new Date(Date.now() - days * DAY));

  const billMonthById = new Map<string, string>();
  if (account.type === "CREDIT") {
    const bills = await listBills(apiKey, account.id).catch(() => []);
    for (const bill of bills) {
      const due = dayOrNull(bill.dueDate);
      if (due) billMonthById.set(bill.id, due.slice(0, 7));
      await sql`
        insert into bank_bills (id, account_id, due_date, close_date, total_amount, synced_at)
        values (${bill.id}, ${account.id}, ${due}, ${dayOrNull(bill.billClosingDate)},
                ${bill.totalAmount ?? null}, now())
        on conflict (id) do update set
          due_date = excluded.due_date,
          close_date = excluded.close_date,
          total_amount = excluded.total_amount,
          synced_at = now()
      `;
    }
  }

  const transactions = await listTransactions(apiKey, account.id, from);
  const records = transactions
    .filter((tx) => tx.id && tx.date)
    .map((tx) => transactionRecord(tx, billMonthById));
  await upsertTransactions(sql, records);

  // Compras pendentes do cartão às vezes mudam de id quando a fatura fecha. Tudo que
  // sumiu da janela relida deixou de existir no banco e sai daqui também, evitando
  // duplicidade. Uma resposta vazia nunca apaga nada.
  if (records.length > 0) {
    await sql.query(
      `delete from bank_transactions
       where account_id = $1 and date >= $2 and not (id = any($3::text[]))`,
      [account.id, from, records.map((record) => record.id)],
    );
  }
  return records.length;
}

export async function syncAll(trigger: "cron" | "manual" | "auto"): Promise<BankSyncResult> {
  const sql = await getSql();
  const runs = await sql<{ id: number }>`
    insert into bank_sync_runs (trigger) values (${trigger}) returning id
  `;
  const runId = runs[0]?.id;
  const errors: string[] = [];
  let count = 0;

  const items = configuredItems();
  if (items.length === 0) {
    errors.push("Nenhum banco configurado. Defina PLUGGY_ITEMS na Vercel.");
  }

  const apiKeys = new Map<string, string>();
  for (const item of items) {
    try {
      const credentials = credentialsFor(item.ownerRole);
      if (!credentials) {
        throw new Error("Chaves da Pluggy ausentes (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET).");
      }
      let apiKey = apiKeys.get(credentials.clientId);
      if (!apiKey) {
        apiKey = await createApiKey(credentials);
        apiKeys.set(credentials.clientId, apiKey);
      }
      const info = await getItem(apiKey, item.itemId).catch(() => null);
      if (info) {
        await sql`
          insert into bank_items (item_id, owner_role, status, last_updated_at, synced_at)
          values (${item.itemId}, ${item.ownerRole}, ${info.executionStatus ?? info.status ?? null},
                  ${info.lastUpdatedAt ?? null}, now())
          on conflict (item_id) do update set
            owner_role = excluded.owner_role,
            status = excluded.status,
            last_updated_at = excluded.last_updated_at,
            synced_at = now()
        `;
      }
      // No botão de atualizar, também pede à Pluggy para buscar novidades no banco.
      // Elas chegam em alguns minutos; a leitura abaixo traz o que já está lá.
      if (trigger === "manual") {
        await requestItemUpdate(apiKey, item.itemId).catch(() => false);
      }
      const accounts = await listAccounts(apiKey, item.itemId);
      const institution = institutionFrom(accounts);
      for (const account of accounts) {
        await upsertAccount(sql, item, institution, account);
        count += await syncAccount(sql, apiKey, account);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Item ${item.itemId.slice(0, 8)}: ${message}`);
    }
  }

  if (runId !== undefined) {
    await sql`
      update bank_sync_runs
      set finished_at = now(), ok = ${errors.length === 0},
          message = ${errors.length ? errors.join(" | ").slice(0, 1000) : null},
          transactions = ${count}
      where id = ${runId}
    `;
  }
  return { ok: errors.length === 0, transactions: count, errors };
}

/** Momento (ms) da última sincronização bem-sucedida, ou null. */
export async function lastSuccessfulSyncAt(): Promise<number | null> {
  const sql = await getSql();
  const rows = await sql<{ at: string | null }>`
    select to_char(max(finished_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
    from bank_sync_runs where ok
  `;
  const at = rows[0]?.at;
  return at ? Date.parse(at) : null;
}

const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

export async function readSnapshot(): Promise<BankSnapshot> {
  const sql = await getSql();
  const accountRows = await sql<Record<string, unknown>>`
    select id, item_id, owner_role, type, subtype, name, number, institution, balance,
           credit_limit, available_limit, due_date, close_date,
           to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as updated_at
    from bank_accounts order by institution, type, name
  `;
  const txRows = await sql<Record<string, unknown>>`
    select id, account_id, date, description, merchant, amount, direction, status, category,
           operation_type, installment_number, installment_total, purchase_date, bill_month,
           to_char(provider_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as created_at
    from bank_transactions
    where date >= (current_date - interval '420 days')
    order by date desc, id
  `;
  const overrideRows = await sql<Record<string, unknown>>`
    select tx_id, category, person_id, nature from bank_tx_overrides
  `;
  const ruleRows = await sql<Record<string, unknown>>`
    select merchant_key, category from bank_merchant_rules
  `;
  const runRows = await sql<Record<string, unknown>>`
    select trigger, ok, message, transactions,
           to_char(coalesce(finished_at, started_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as at
    from bank_sync_runs where finished_at is not null order by id desc limit 1
  `;
  const lastSuccess = await lastSuccessfulSyncAt();
  const itemRows = await sql<Record<string, unknown>>`
    select item_id, status,
           to_char(last_updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as last_updated_at
    from bank_items
  `.catch(() => [] as Record<string, unknown>[]);
  const billRows = await sql<Record<string, unknown>>`
    select id, account_id, total_amount,
           to_char(due_date, 'YYYY-MM-DD') as due_date,
           to_char(close_date, 'YYYY-MM-DD') as close_date
    from bank_bills
    where due_date >= (current_date - interval '120 days')
  `.catch(() => [] as Record<string, unknown>[]);
  const bills: BankBillRow[] = billRows.map((row) => ({
    id: String(row.id),
    accountId: String(row.account_id),
    dueDate: (row.due_date as string | null) ?? null,
    closeDate: (row.close_date as string | null) ?? null,
    totalAmount: num(row.total_amount),
  }));
  const items: BankItemInfo[] = itemRows.map((row) => ({
    itemId: String(row.item_id),
    status: (row.status as string | null) ?? null,
    lastUpdatedAt: (row.last_updated_at as string | null) ?? null,
  }));

  const accounts: BankAccountRow[] = accountRows.map((row) => ({
    id: String(row.id),
    itemId: String(row.item_id),
    ownerRole: row.owner_role === "partner" ? "partner" : "you",
    type: row.type === "CREDIT" ? "CREDIT" : "BANK",
    subtype: (row.subtype as string | null) ?? null,
    name: String(row.name ?? ""),
    number: (row.number as string | null) ?? null,
    institution: String(row.institution ?? "Banco"),
    balance: num(row.balance),
    creditLimit: num(row.credit_limit),
    availableLimit: num(row.available_limit),
    dueDate: (row.due_date as string | null) ?? null,
    closeDate: (row.close_date as string | null) ?? null,
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  }));

  const transactions: BankTransactionRow[] = txRows.map((row) => ({
    id: String(row.id),
    accountId: String(row.account_id),
    date: String(row.date),
    description: String(row.description ?? ""),
    merchant: (row.merchant as string | null) ?? null,
    amount: Number(row.amount ?? 0),
    direction: row.direction === "CREDIT" ? "CREDIT" : "DEBIT",
    status: (row.status as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    operationType: (row.operation_type as string | null) ?? null,
    installmentNumber: num(row.installment_number),
    installmentTotal: num(row.installment_total),
    purchaseDate: (row.purchase_date as string | null) ?? null,
    billMonth: (row.bill_month as string | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
  }));

  const overrides: BankOverride[] = overrideRows.map((row) => ({
    txId: String(row.tx_id),
    category: (row.category as string | null) ?? null,
    personId: (row.person_id as string | null) ?? null,
    nature: (row.nature as string | null) ?? null,
  }));

  const rules: BankMerchantRule[] = ruleRows.map((row) => ({
    merchantKey: String(row.merchant_key),
    category: String(row.category),
  }));

  const run = runRows[0];
  const lastSync: BankSyncInfo | null = run
    ? {
        at: String(run.at),
        trigger: String(run.trigger),
        ok: Boolean(run.ok),
        message: (run.message as string | null) ?? null,
        transactions: num(run.transactions),
      }
    : null;

  return {
    accounts,
    items,
    bills,
    transactions,
    overrides,
    rules,
    lastSync,
    lastSuccessAt: lastSuccess ? new Date(lastSuccess).toISOString() : null,
  };
}

export async function saveEdit(input: BankEditInput) {
  const sql = await getSql();
  await sql`
    insert into bank_tx_overrides (tx_id, category, person_id, nature, updated_at)
    values (${input.txId}, ${input.category ?? null}, ${input.personId ?? null},
            ${input.nature ?? null}, now())
    on conflict (tx_id) do update set
      category = coalesce(excluded.category, bank_tx_overrides.category),
      person_id = coalesce(excluded.person_id, bank_tx_overrides.person_id),
      nature = coalesce(excluded.nature, bank_tx_overrides.nature),
      updated_at = now()
  `;
  if (input.category && input.merchantKey) {
    await sql`
      insert into bank_merchant_rules (merchant_key, category, updated_at)
      values (${input.merchantKey}, ${input.category}, now())
      on conflict (merchant_key) do update set category = excluded.category, updated_at = now()
    `;
  }
}
