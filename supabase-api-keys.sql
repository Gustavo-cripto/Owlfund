-- Run this in Supabase SQL editor
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Chave API',
  key_hash text not null unique,
  key_prefix text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.api_keys enable row level security;

create policy "Users manage own keys"
  on public.api_keys for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role bypasses RLS (used by API routes via supabaseAdmin)
