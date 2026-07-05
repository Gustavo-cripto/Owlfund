-- Run this in Supabase SQL Editor
create table if not exists mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_mfa_recovery_user on mfa_recovery_codes(user_id);

-- Only the service role (server) touches this table; no client access.
alter table mfa_recovery_codes enable row level security;
