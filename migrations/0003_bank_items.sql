-- Quando a Pluggy atualizou cada conexão (item) pela última vez, para o app mostrar
-- de quando são os dados do banco.
create table if not exists bank_items (
  item_id text primary key,
  owner_role text not null default 'you',
  status text,
  last_updated_at timestamptz,
  synced_at timestamptz not null default now()
);
