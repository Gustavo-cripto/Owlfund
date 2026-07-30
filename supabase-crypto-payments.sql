-- Run this in Supabase SQL editor to enable crypto payments for the plans.
-- Estratégia: reutilizar a tabela `subscriptions` (mesmo gating de planos). Um
-- pagamento em cripto cria uma linha com source='crypto' e current_period_end;
-- o cron /api/cron/crypto-expiry marca status='canceled' quando expira.

-- Origem do plano (Stripe vs cripto) + validade (o Stripe já usa current_period_end).
alter table public.subscriptions add column if not exists source text not null default 'stripe';
alter table public.subscriptions add column if not exists current_period_end timestamptz;

-- Auditoria e idempotência dos pagamentos em cripto (um registo por evento do
-- processador). O `provider_event_id` único garante que nunca creditamos 2×.
create table if not exists public.crypto_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,                        -- 'helio' | 'btcpay' | 'sphere' | ...
  provider_event_id text unique,                 -- idempotência do webhook
  plan text not null,                            -- 'pro' | 'premium'
  period text not null,                          -- 'monthly' | 'annual'
  chain text not null default '',                -- 'BTC' | 'ETH' | 'SOL' | ...
  currency text not null default '',             -- 'USDC' | 'BTC' | 'ETH'
  amount numeric not null default 0,
  tx_hash text,
  status text not null default 'pending',        -- 'pending'|'confirmed'|'expired'|'failed'
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);
alter table public.crypto_payments enable row level security;
-- RLS ativa sem políticas = só o service role (rotas da API) lê/escreve. O
-- utilizador vê o seu estado via /api/subscription (server-side), nunca por
-- acesso direto à tabela.

create index if not exists crypto_payments_user_idx
  on public.crypto_payments (user_id, created_at desc);
