-- Chaves de exchange guardadas no servidor (opção da pessoa), cifradas.
--
-- PORQUÊ: por omissão as chaves de API ficam no browser, e só actualizamos os
-- saldos com a app aberta. Quem quiser actualização com a app fechada escolhe
-- guardá-las aqui. O que fica na tabela é o CIFRADO (AES-256-GCM com a chave
-- CEX_KEYS_SECRET, que só existe na Vercel) — nunca a chave em claro.
--
-- Acesso: só o service_role. Nem anon nem authenticated tocam nisto, como no
-- resto do fecho de escritas (supabase-fechar-escritas.sql). A API do site é
-- quem lê e escreve, sempre em nome do utilizador com sessão.
--
-- ⬜ POR APLICAR. Correr uma vez no editor de SQL do Supabase.

create table if not exists public.cex_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exchange text not null,
  label text,
  -- iv + tag + texto cifrado, em base64 (ver src/lib/cex/cofre.ts)
  enc text not null,
  -- última leitura bem sucedida, para servir sem ir à exchange
  balances jsonb,
  balances_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cex_keys_user_idx on public.cex_keys (user_id);

alter table public.cex_keys enable row level security;
revoke all on public.cex_keys from anon, authenticated;
grant select, insert, update, delete on public.cex_keys to service_role;
