-- Saúde de cada conexão da Pluggy: por que ela parou de atualizar e o que o pedido
-- de atualização manual respondeu. Só leitura para o app mostrar o motivo.
alter table bank_items add column if not exists execution_status text;
alter table bank_items add column if not exists error_code text;
alter table bank_items add column if not exists error_message text;
alter table bank_items add column if not exists consent_expires_at timestamptz;
alter table bank_items add column if not exists update_requested_at timestamptz;
alter table bank_items add column if not exists update_result text;
