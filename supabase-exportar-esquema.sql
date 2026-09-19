-- Exportar o esquema e as regras de acesso que NÃO estão no repositório.
--
-- PORQUÊ: cinco tabelas centrais (profiles, subscriptions, chat_usage,
-- wallet_config, webhook_config, entre outras) só existem dentro do Supabase.
-- O repositório tem ficheiros de SQL para algumas coisas, mas não para estas.
-- Isso quer dizer três coisas, todas más:
--
--   • ninguém consegue rever as regras de acesso sem entrar no painel;
--   • uma regra que se perca ou mude não deixa rasto nenhum;
--   • recriar o projeto do zero (ou montar um ambiente de testes) é
--     impossível sem as adivinhar.
--
-- Isto NÃO altera nada. São três consultas de leitura. Corre-as no editor de
-- SQL do Supabase, copia o resultado de cada uma e manda-mo: eu escrevo os
-- ficheiros e ficam no repositório, revistos como o resto do código.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. As colunas de cada tabela
-- ───────────────────────────────────────────────────────────────────────────
select table_name, ordinal_position, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
 order by table_name, ordinal_position;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. As regras de acesso por linha (RLS), e se estão sequer ligadas
-- ───────────────────────────────────────────────────────────────────────────
select c.relname            as tabela,
       c.relrowsecurity     as rls_ligado,
       c.relforcerowsecurity as rls_forcado,
       p.polname            as politica,
       p.polcmd             as comando,
       pg_get_expr(p.polqual, p.polrelid)      as usando,
       pg_get_expr(p.polwithcheck, p.polrelid) as com_verificacao
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policy p on p.polrelid = c.oid
 where n.nspname = 'public' and c.relkind = 'r'
 order by c.relname, p.polname;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Permissões POR COLUNA (o que a RLS não consegue limitar)
--
-- É aqui que se vê se o browser pode escrever colunas que não devia — por
-- exemplo `stripe_customer_id` em `profiles`, que é o que autoriza o portal
-- de faturação. Se esta consulta não devolver nada para `authenticated`, a
-- permissão é a da tabela inteira, e é o caso a corrigir com
-- supabase-profiles-colunas.sql.
-- ───────────────────────────────────────────────────────────────────────────
select table_name, grantee, privilege_type, column_name
  from information_schema.column_privileges
 where table_schema = 'public'
   and grantee in ('anon', 'authenticated')
 order by table_name, grantee, privilege_type, column_name;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Índices únicos — para saber a chave certa de cada upsert
--
-- O webhook da Stripe grava em `subscriptions` sem dizer qual é a chave de
-- conflito, porque ninguém sabe qual é. Uma conta pode ter três linhas
-- (Stripe, cripto, beta), por isso não pode ser só o user_id.
-- ───────────────────────────────────────────────────────────────────────────
select t.relname as tabela, i.relname as indice, ix.indisunique as unico,
       array_agg(a.attname order by a.attnum) as colunas
  from pg_index ix
  join pg_class t on t.oid = ix.indrelid
  join pg_class i on i.oid = ix.indexrelid
  join pg_namespace n on n.oid = t.relnamespace
  join pg_attribute a on a.attrelid = t.oid and a.attnum = any(ix.indkey)
 where n.nspname = 'public' and ix.indisunique
 group by t.relname, i.relname, ix.indisunique
 order by t.relname, i.relname;
