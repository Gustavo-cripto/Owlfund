-- ============================================================================
-- ChainFolioAI — Setup do sistema de BETA. Correr UMA vez no Supabase → SQL Editor.
-- ============================================================================
-- Resolve dois pontos:
--   1) A tabela `subscriptions` precisa das colunas `source`, `current_period_end`
--      e `cancel_at_period_end` (as atribuições de plano escrevem-nas). Sem elas,
--      o painel /admin/beta dá erro e as ativações falham (Postgres 42703).
--   2) Cria a tabela `beta_signups` para o painel listar as inscrições pendentes.
-- Tudo idempotente (if not exists) — seguro correr mais do que uma vez.
-- ============================================================================

-- 1) Colunas em falta na subscriptions ---------------------------------------
alter table public.subscriptions add column if not exists source text not null default 'stripe';
alter table public.subscriptions add column if not exists current_period_end timestamptz;
alter table public.subscriptions add column if not exists cancel_at_period_end boolean not null default false;

-- 2) Inscrições do /beta ------------------------------------------------------
create table if not exists public.beta_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  name text,
  note text,
  lang text,
  ip text,
  status text not null default 'pending', -- 'pending' | 'activated' | 'ignored'
  created_at timestamptz not null default now()
);
create index if not exists beta_signups_status_idx on public.beta_signups (status, created_at desc);
alter table public.beta_signups enable row level security;
-- Sem políticas: só o service role (rotas da API) acede.
