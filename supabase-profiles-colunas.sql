-- ⚠️ SUBSTITUÍDO por supabase-fechar-escritas.sql, que faz isto e muito mais
--    (este ficheiro só tratava da tabela de perfis; o problema era em todas).
--    Mantido só como registo. NÃO correr.
--
-- Que colunas da tabela `profiles` o browser pode mesmo escrever.
--
-- PORQUÊ: a página de Conta escreve em `profiles` a partir do browser, com a
-- chave pública, para guardar a fotografia de perfil e a preferência de
-- fotografias automáticas do portefólio. Isso exige uma política de escrita
-- para o utilizador autenticado.
--
-- O problema é que as políticas do Postgres limitam LINHAS, não COLUNAS. Ou
-- seja: a mesma sessão que grava a fotografia podia, pelo mesmo endereço da
-- API do Supabase, escrever qualquer outra coluna da SUA linha — incluindo
-- `stripe_customer_id`, que é o que autoriza a abertura do portal de
-- faturação. Bastaria escrever lá o identificador de outra pessoa.
--
-- Já fechámos o lado do servidor: /api/stripe/portal passou a confirmar, junto
-- da Stripe, que o cliente pertence mesmo a quem pede. Isto aqui é o segundo
-- muro, e é o que resolve o problema na origem.
--
-- Correr uma vez no editor de SQL do Supabase.

-- 1. Tirar a permissão ampla de escrita ao papel dos utilizadores autenticados.
revoke update on table public.profiles from authenticated;
revoke insert on table public.profiles from authenticated;

-- 2. Devolver só as colunas que a interface precisa mesmo de escrever.
--    Se amanhã a página passar a guardar outra preferência, acrescenta-se aqui
--    — e é bom que dê trabalho: é essa fricção que impede o próximo descuido.
grant update (avatar_url, auto_snapshot) on table public.profiles to authenticated;
grant insert (id, avatar_url, auto_snapshot) on table public.profiles to authenticated;

-- 3. Conferir o resultado. Depois de correr, esta consulta deve devolver
--    apenas avatar_url e auto_snapshot (e o id, no insert).
--
-- select grantee, privilege_type, column_name
--   from information_schema.column_privileges
--  where table_name = 'profiles' and grantee = 'authenticated'
--  order by privilege_type, column_name;

-- NOTA: o papel `service_role` não é afectado — continua a poder escrever tudo,
-- que é como o webhook da Stripe grava o `stripe_customer_id`.
