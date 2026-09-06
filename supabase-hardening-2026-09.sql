-- ChainFolioAI — endurecimento pós-auditoria (2026-09-06). Correr UMA vez no
-- Supabase SQL Editor (projeto owlfund). Idempotente.

-- 1) A função de rate-limit era executável por qualquer cliente anon/authenticated
--    (podia esgotar a quota de chat de outro utilizador). Só o service role a chama.
revoke execute on function public.api_rate_check(text, int, int) from public, anon, authenticated;
grant  execute on function public.api_rate_check(text, int, int) to service_role;

-- 2) Policies "FOR ALL" demasiado largas: o cliente podia inserir chaves API
--    (contornar o máx. de 5 / reativar revogadas) e repor o contador Free do chat.
--    As rotas usam service role (ignora RLS) → o utilizador só precisa de LER.
drop policy if exists "Users manage own keys" on public.api_keys;
create policy "Users read own keys" on public.api_keys for select using (auth.uid() = user_id);

drop policy if exists "chat_usage_own" on public.chat_usage;
drop policy if exists "chat_usage_service" on public.chat_usage;
create policy "chat_usage_read_own" on public.chat_usage for select using (auth.uid() = user_id);

-- 3) Idempotência dos emails de marco (3 dias, 1 dia, oferta de fundador, fim de
--    beta, avisos cripto): um cron a correr 2× já não reenvia; um dia falhado
--    é apanhado no dia seguinte.
create table if not exists public.notification_log (
  user_id uuid not null,
  kind text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.notification_log enable row level security;
-- sem policies = só service role.

-- 4) Índices em falta.
create index if not exists api_keys_user_id_idx on public.api_keys (user_id);
create index if not exists beta_signups_email_idx on public.beta_signups (lower(email));
create index if not exists api_rate_limits_window_idx on public.api_rate_limits (window_start);

-- 5) Inscrições duplicadas no beta: remove repetidas (fica a mais antiga) e
--    impede novas. (O código também verifica antes de inserir.)
delete from public.beta_signups a
  using public.beta_signups b
  where lower(a.email) = lower(b.email) and a.created_at > b.created_at;
create unique index if not exists beta_signups_email_unique on public.beta_signups (lower(email));

-- 6) Expira JÁ os testers manuais cujo período terminou (o cron passa a fazê-lo
--    diariamente; até agora ninguém voltava ao Free).
update public.subscriptions
   set status = 'canceled'
 where source = 'manual' and status = 'active' and current_period_end < now();
