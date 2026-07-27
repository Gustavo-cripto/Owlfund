-- Run this in Supabase SQL editor to enable alert webhooks.
-- Todas as tabelas: só o service role (rotas da API) escreve/lê. RLS ativa
-- sem políticas = os utilizadores não acedem diretamente (o segredo do webhook
-- nunca é exposto por acesso direto à tabela).

-- Config do webhook (um por utilizador).
create table if not exists public.webhook_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  url text not null,
  secret text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.webhook_config enable row level security;

-- Cópia da watchlist do Smart Money no servidor (sincronizada pelo cliente),
-- para o cron poder varrer mesmo com o browser fechado.
create table if not exists public.smart_money_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  chain text not null,
  label text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, address, chain)
);
alter table public.smart_money_watchlist enable row level security;

-- Deduplicação: cada movimento só dispara um webhook uma vez.
create table if not exists public.whale_alert_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  dedup_key text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, dedup_key)
);
alter table public.whale_alert_log enable row level security;

-- (Opcional) limpeza do log antigo — corre de vez em quando:
-- delete from public.whale_alert_log where sent_at < now() - interval '7 days';
