-- Guarda as inscrições do /beta para aparecerem no painel /admin/beta com botão
-- "Aceitar". Corre UMA vez no Supabase → SQL Editor. Só o service role (rotas
-- da API) acede; RLS ativa sem políticas = utilizadores não acedem diretamente.
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
