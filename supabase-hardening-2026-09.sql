-- ChainFolioAI — endurecimento pós-auditoria (2026-09-06).
-- Correr UMA vez no Supabase → SQL Editor (projeto owlfund). É idempotente:
-- podes correr outra vez sem estragar nada.
--
-- Cada passo verifica primeiro se o objeto existe — se uma tabela/função ainda
-- não foi criada, esse passo é SALTADO com um aviso em vez de dar erro e
-- abortar os restantes. No fim há um relatório com o estado de cada item.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) A função de rate-limit era executável por qualquer cliente anon/authenticated
--    (podia esgotar a quota de chat de outro utilizador). Só o service role a usa.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'api_rate_check'
  ) then
    execute 'revoke execute on function public.api_rate_check(text, int, int) from public, anon, authenticated';
    execute 'grant  execute on function public.api_rate_check(text, int, int) to service_role';
    raise notice '1) OK — api_rate_check passou a ser só do service_role.';
  else
    raise notice '1) SALTADO — a função api_rate_check nao existe (corre antes supabase-rate-limits.sql).';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Policies "FOR ALL" demasiado largas: o cliente podia inserir chaves API
--    (contornar o máximo de 5 / reativar revogadas) e repor o contador do chat
--    do plano Free. As rotas do site usam service role (que ignora RLS), por
--    isso o utilizador só precisa de LER.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.api_keys') is not null then
    drop policy if exists "Users manage own keys" on public.api_keys;
    drop policy if exists "Users read own keys"   on public.api_keys;
    create policy "Users read own keys" on public.api_keys
      for select using (auth.uid() = user_id);
    raise notice '2a) OK — api_keys: o utilizador so pode LER as suas chaves.';
  else
    raise notice '2a) SALTADO — tabela api_keys nao existe.';
  end if;

  if to_regclass('public.chat_usage') is not null then
    drop policy if exists "chat_usage_own"      on public.chat_usage;
    drop policy if exists "chat_usage_service"  on public.chat_usage;
    drop policy if exists "chat_usage_read_own" on public.chat_usage;
    create policy "chat_usage_read_own" on public.chat_usage
      for select using (auth.uid() = user_id);
    raise notice '2b) OK — chat_usage: o utilizador so pode LER o seu contador.';
  else
    raise notice '2b) SALTADO — tabela chat_usage nao existe.';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Idempotência dos emails de marco (3 dias, 1 dia, oferta de fundador, fim
--    de beta, avisos cripto): o cron pode correr 2× sem reenviar, e um dia
--    falhado é apanhado no dia seguinte.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.notification_log (
  user_id uuid not null,
  kind    text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.notification_log enable row level security;
-- Sem policies = ninguém acede sem service role (é o que queremos).

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Índices em falta (consultas por utilizador/email/janela).
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.api_keys') is not null then
    create index if not exists api_keys_user_id_idx on public.api_keys (user_id);
  end if;
  if to_regclass('public.beta_signups') is not null then
    create index if not exists beta_signups_email_idx on public.beta_signups (lower(email));
  end if;
  if to_regclass('public.api_rate_limits') is not null then
    create index if not exists api_rate_limits_window_idx on public.api_rate_limits (window_start);
  end if;
  raise notice '4) OK — indices criados (os que faziam falta).';
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Inscrições duplicadas no beta: apaga as repetidas (fica sempre a MAIS
--    ANTIGA de cada email) e impede novas. O código do site já verifica antes
--    de inserir; isto fecha a porta de vez.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  removidas int := 0;
begin
  if to_regclass('public.beta_signups') is not null then
    delete from public.beta_signups a
      using public.beta_signups b
     where lower(a.email) = lower(b.email)
       and a.created_at > b.created_at;
    get diagnostics removidas = row_count;
    create unique index if not exists beta_signups_email_unique
      on public.beta_signups (lower(email));
    raise notice '5) OK — % inscricao(oes) duplicada(s) removida(s); email agora e unico.', removidas;
  else
    raise notice '5) SALTADO — tabela beta_signups nao existe.';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Expira JÁ os testers manuais cujo período de 60 dias terminou (voltam ao
--    plano Free). A partir de agora o cron diário faz isto sozinho.
--    NÃO apaga dados nenhuns — só muda o estado da subscrição.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  expirados int := 0;
begin
  if to_regclass('public.subscriptions') is not null then
    update public.subscriptions
       set status = 'canceled'
     where source = 'manual'
       and status = 'active'
       and current_period_end < now();
    get diagnostics expirados = row_count;
    raise notice '6) OK — % tester(s) expirado(s) voltaram ao plano Free.', expirados;
  else
    raise notice '6) SALTADO — tabela subscriptions nao existe.';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RELATÓRIO FINAL — deve dar tudo ✅ (ou ⚠️ se algo ainda não existe).
-- ─────────────────────────────────────────────────────────────────────────────
select 1 as passo, 'api_rate_check só service_role' as verificacao,
  case
    when not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = 'api_rate_check')
      then '⚠️ funcao nao existe — corre supabase-rate-limits.sql'
    when has_function_privilege('anon',
          (select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'api_rate_check' limit 1), 'execute')
      then '❌ anon ainda consegue executar'
    else '✅ protegida'
  end as resultado
union all
select 2, 'api_keys sem policies de escrita',
  case when to_regclass('public.api_keys') is null then '⚠️ tabela nao existe'
       when exists (select 1 from pg_policies where schemaname = 'public'
                     and tablename = 'api_keys' and cmd <> 'SELECT')
         then '❌ ainda ha policy de escrita'
       else '✅ so leitura' end
union all
select 3, 'chat_usage sem policies de escrita',
  case when to_regclass('public.chat_usage') is null then '⚠️ tabela nao existe'
       when exists (select 1 from pg_policies where schemaname = 'public'
                     and tablename = 'chat_usage' and cmd <> 'SELECT')
         then '❌ ainda ha policy de escrita'
       else '✅ so leitura' end
union all
select 4, 'notification_log criada (emails sem duplicados)',
  case when to_regclass('public.notification_log') is null then '❌ nao criada' else '✅ criada' end
union all
select 5, 'beta_signups com email unico',
  case when to_regclass('public.beta_signups') is null then '⚠️ tabela nao existe'
       when exists (select 1 from pg_indexes where schemaname = 'public'
                     and indexname = 'beta_signups_email_unique')
         then '✅ unico'
       else '❌ sem indice unico' end
union all
select 6, 'testers manuais expirados ainda ativos',
  case when to_regclass('public.subscriptions') is null then '⚠️ tabela nao existe'
       when (select count(*) from public.subscriptions
              where source = 'manual' and status = 'active' and current_period_end < now()) > 0
         then '❌ ainda ha testers vencidos ativos'
       else '✅ nenhum' end
order by passo;
