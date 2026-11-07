-- Lote 3 da auditoria: registo dos crons e vigia do Mac dos bots.
-- Correr uma vez no Supabase (SQL Editor). Pode voltar a correr-se sem problema.
-- Só o servidor escreve e lê (chave de serviço): RLS ligada e sem políticas.

create table if not exists public.cron_runs (
  cron text primary key,
  ultimo_em timestamptz not null default now(),
  ultimo_ok_em timestamptz,
  detalhe text,
  criado_em timestamptz not null default now()
);
alter table public.cron_runs enable row level security;

create table if not exists public.bots_status (
  id int primary key,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  ultimo_aviso jsonb
);
alter table public.bots_status enable row level security;

-- Desfazer (apaga só estas duas tabelas de vigilância):
-- drop table if exists public.bots_status;
-- drop table if exists public.cron_runs;
