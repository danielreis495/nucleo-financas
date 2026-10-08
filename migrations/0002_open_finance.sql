-- Dados sincronizados do Open Finance (Pluggy / MeuPluggy).
-- A Pluggy é a fonte da verdade: contas, faturas e transações são regravadas a
-- cada sincronização. Ajustes feitos no app ficam em tabelas separadas
-- (overrides e regras por estabelecimento) para nunca se perderem.

create table if not exists bank_accounts (
  id text primary key,
  item_id text not null,
  owner_role text not null default 'you',
  type text not null,
  subtype text,
  name text not null,
  number text,
  institution text not null,
  balance numeric,
  credit_limit numeric,
  available_limit numeric,
  due_date date,
  close_date date,
  updated_at timestamptz not null default now()
);

create table if not exists bank_transactions (
  id text primary key,
  account_id text not null,
  date date not null,
  description text not null default '',
  merchant text,
  amount numeric not null,
  direction text not null,
  status text,
  category text,
  operation_type text,
  installment_number integer,
  installment_total integer,
  purchase_date date,
  bill_id text,
  bill_month text,
  provider_created_at timestamptz,
  synced_at timestamptz not null default now()
);

create index if not exists bank_transactions_account_date
  on bank_transactions (account_id, date);

create table if not exists bank_bills (
  id text primary key,
  account_id text not null,
  due_date date,
  close_date date,
  total_amount numeric,
  synced_at timestamptz not null default now()
);

create table if not exists bank_tx_overrides (
  tx_id text primary key,
  category text,
  person_id text,
  nature text,
  updated_at timestamptz not null default now()
);

create table if not exists bank_merchant_rules (
  merchant_key text primary key,
  category text not null,
  updated_at timestamptz not null default now()
);

create table if not exists bank_sync_runs (
  id bigserial primary key,
  trigger text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  message text,
  transactions integer
);
