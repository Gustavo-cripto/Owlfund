-- Fundadores: testers com preço vitalício reservado (Pro €9,99 / Premium €19).
-- Escrito apenas pelo service role (webhook Telegram + painel admin);
-- RLS ligada sem policies públicas => invisível a clientes anon/auth.
create table if not exists public.founders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  reserved_at timestamptz not null default now()
);

alter table public.founders enable row level security;
