-- FECHAR AS ESCRITAS DIRETAS À BASE DE DADOS.
--
-- Isto corrige a falha mais séria encontrada nesta ronda, e só apareceu ao
-- olhar para a base de dados a sério — não estava no código.
--
-- ── O QUE ESTAVA MAL ───────────────────────────────────────────────────────
--
-- Os papéis `anon` e `authenticated` tinham INSERT, UPDATE e DELETE em TODAS as
-- dezasseis tabelas. E a tabela `subscriptions` tem uma política que permite
-- todos os comandos sobre a própria linha:
--
--     own_sub — for all — using (auth.uid() = user_id)
--
-- O plano de cada pessoa é decidido lendo essa tabela: `status` em "active" ou
-- "trialing", e o `price_id` a dizer se é Pro ou Premium
-- (src/lib/api/entitlement.ts).
--
-- Junta-se tudo e dá isto: qualquer pessoa com sessão iniciada podia falar
-- diretamente com a API do Supabase e escrever na sua própria linha
--
--     { status: "active", price_id: "<o do Premium>", current_period_end: 2099 }
--
-- e ficava com Premium de graça, incluindo o Gestor de IA, a API e o servidor
-- MCP. Não precisava de tocar no site: a chave pública e o próprio login
-- bastavam. O mesmo caminho servia para escrever `stripe_customer_id` na
-- tabela de perfis e abrir o portal de faturação de outra pessoa.
--
-- ── O QUE A APLICAÇÃO PRECISA MESMO ───────────────────────────────────────
--
-- Verifiquei ficheiro a ficheiro. Do browser só se escreve em duas tabelas:
--
--   • profiles            — a fotografia de perfil e a preferência de
--                           fotografias automáticas do portefólio;
--   • portfolio_snapshots — gravar e apagar fotografias do portefólio, que é
--                           uma funcionalidade central.
--
-- Todo o resto é escrito no servidor com a chave de serviço, que não é afetada
-- por nada disto. A LEITURA também não é tocada: continua limitada pelas
-- políticas, que já restringem cada pessoa à sua própria linha.
--
-- ✅ APLICADO em produção a 20 de setembro de 2026, e verificado com uma sessão
--    simulada: gravar fotografias do portefólio e a preferência continuam a
--    funcionar; dar-se Premium e escrever o cliente de faturação ficaram
--    bloqueados. Ver supabase-estado-verificado.sql.
--
-- Correr uma vez no editor de SQL do Supabase.

-- ── 1. Tirar a escrita a quem não precisa dela ─────────────────────────────
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('revoke insert, update, delete on table public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

-- ── 2. Devolver só o que a interface escreve de facto ──────────────────────

-- Página de Conta: fotografia de perfil e preferência de fotografias
-- automáticas. O `stripe_customer_id` fica de fora — é autorização, não
-- preferência.
grant insert (id, avatar_url, auto_snapshot) on table public.profiles to authenticated;
grant update (avatar_url, auto_snapshot)     on table public.profiles to authenticated;

-- Página de Portefólio: gravar uma fotografia e apagar uma que já não serve.
-- Sem UPDATE: uma fotografia guardada não se reescreve.
grant insert (user_id, data) on table public.portfolio_snapshots to authenticated;
grant delete                 on table public.portfolio_snapshots to authenticated;

-- ── 3. Conferir ────────────────────────────────────────────────────────────
-- Deve devolver apenas profiles e portfolio_snapshots, com as colunas acima.
select table_name, grantee, privilege_type, coalesce(column_name, '(tabela)') as coluna
  from information_schema.column_privileges
 where table_schema = 'public'
   and grantee in ('anon', 'authenticated')
   and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
 order by table_name, grantee, privilege_type, column_name;
