-- Versão da leitura de cada conta. Contas na versão 1 foram gravadas antes da correção
-- do sentido dos estornos no cartão; a próxima sincronização relê o histórico inteiro
-- (400 dias) uma vez e passa para a versão 2.
alter table bank_accounts add column if not exists sync_version integer not null default 1;
