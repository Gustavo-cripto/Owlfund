-- ESTADO VERIFICADO DA BASE DE DADOS — 20 de setembro de 2026
--
-- Isto não é uma migração. É o registo do que está mesmo no Supabase, lido
-- diretamente do catálogo do Postgres nesse dia. Existe porque o esquema vivia
-- só dentro do painel, e isso já custou dois erros reais (ver abaixo).
--
-- O que falta ainda: a lista completa de colunas e tipos de cada tabela. Uma
-- leitura que pedi ficou bloqueada por limite de permissões; fica para quando
-- se puder correr `supabase-exportar-esquema.sql` por inteiro.

-- ───────────────────────────────────────────────────────────────────────────
-- ÍNDICES ÚNICOS  (verificados)
--
-- Isto é o que decide a chave de conflito de cada `upsert`. Duas escritas de
-- subscrição não a declaravam e falhavam SEMPRE para quem já tinha uma linha:
-- o upsert caía na chave primária (`id`), que não vai no corpo, tentava
-- inserir, e violava o índice único de `user_id`. Corrigido em a5a3fac.
-- ───────────────────────────────────────────────────────────────────────────
--   api_keys                api_keys_pkey                 (id)
--   api_keys                api_keys_key_hash_key         (key_hash)
--   api_rate_limits         api_rate_limits_pkey          (key_hash, window_start)
--   beta_signups            beta_signups_pkey             (id)
--   chat_usage              chat_usage_pkey               (id)
--   chat_usage              chat_usage_user_id_month_key  (user_id, month)
--   founders                founders_pkey                 (user_id)
--   mfa_recovery_codes      mfa_recovery_codes_pkey       (id)
--   news_briefing_schedule  news_briefing_schedule_pkey   (user_id)
--   notification_log        notification_log_pkey         (user_id, kind)
--   page_views              page_views_pkey               (id)
--   portfolio_snapshots     portfolio_snapshots_pkey      (id)
--   profiles                profiles_pkey                 (id)
--   smart_money_watchlist   smart_money_watchlist_pkey    (user_id, address, chain)
--   subscriptions           subscriptions_pkey            (id)
--   subscriptions           subscriptions_user_id_key     (user_id)   ← UMA linha por conta
--   wallet_config           wallet_config_pkey            (user_id)
--   webhook_config          webhook_config_pkey           (user_id)
--   whale_alert_log         whale_alert_log_pkey          (user_id, dedup_key)

-- ───────────────────────────────────────────────────────────────────────────
-- POLÍTICAS DE ACESSO POR LINHA  (as três que confirmei)
--
-- Todas com RLS ligada. Note-se `own_sub`: permite TODOS os comandos sobre a
-- própria linha. Com os privilégios de escrita que existiam, isso deixava
-- qualquer pessoa com sessão dar-se Premium a si própria. Fechado em
-- supabase-fechar-escritas.sql, aplicado a 20 set 2026.
-- ───────────────────────────────────────────────────────────────────────────
--   profiles      own_profile          for all  using (auth.uid() = id)
--   subscriptions own_sub              for all  using (auth.uid() = user_id)
--   chat_usage    chat_usage_read_own  for select using (auth.uid() = user_id)

-- ───────────────────────────────────────────────────────────────────────────
-- PRIVILÉGIOS DE ESCRITA — antes e depois
--
-- ANTES: `anon` e `authenticated` tinham INSERT, UPDATE e DELETE nas
--        dezasseis tabelas (640 entradas de privilégio por coluna).
-- DEPOIS: sete entradas, só nas duas tabelas em que o browser escreve mesmo.
--
-- Estado verificado com a sessão simulada (papel `authenticated` e
-- `request.jwt.claims` de um utilizador real, tudo desfeito no fim):
--   ✅ gravar fotografia do portefólio       funciona
--   ✅ preferência de fotografias automáticas funciona
--   ✅ dar-se Premium a si próprio            bloqueado (42501)
--   ✅ escrever o cliente de faturação        bloqueado (42501)
-- ───────────────────────────────────────────────────────────────────────────

-- Consulta para reconferir a qualquer momento:
select table_name, grantee, privilege_type, coalesce(column_name, '(tabela)') as coluna
  from information_schema.column_privileges
 where table_schema = 'public'
   and grantee in ('anon', 'authenticated')
   and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
 order by table_name, grantee, privilege_type, column_name;
