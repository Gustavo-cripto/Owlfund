-- 2FA na base de dados (auditoria 6 nov 2026). Correr uma vez no SQL Editor do
-- Supabase. Pode correr-se de novo sem problema.
--
-- PORQUÊ: o URL do Supabase e a chave anon são públicos. As rotas do site já recusam
-- uma sessão só com palavra-passe em contas com 2FA, mas esse mesmo token lia as
-- tabelas diretamente, porque as políticas só olham para auth.uid().
--
-- O QUE FAZ: acrescenta, a cada tabela do esquema público com RLS, uma política
-- RESTRICTIVE: quem tem um fator verificado precisa de uma sessão aal2. Quem não tem
-- 2FA não muda nada. O service role (rotas do servidor) passa por cima de RLS.

create or replace function public.aal_suficiente()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
         where f.user_id = auth.uid() and f.status = 'verified'
      )
$$;

revoke all on function public.aal_suficiente() from public, anon;
grant execute on function public.aal_suficiente() to authenticated;

do $$
declare t record;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public' and rowsecurity
  loop
    execute format('drop policy if exists exige_2fa on public.%I', t.tablename);
    execute format(
      'create policy exige_2fa on public.%I as restrictive for all to authenticated '
      'using ((select public.aal_suficiente())) with check ((select public.aal_suficiente()))',
      t.tablename
    );
  end loop;
end $$;

-- Confirmar: uma linha por tabela protegida.
select tablename, policyname, permissive, cmd
  from pg_policies
 where schemaname = 'public' and policyname = 'exige_2fa'
 order by tablename;

-- Para desfazer:
--   do $$ declare t record; begin
--     for t in select tablename from pg_policies where schemaname = 'public' and policyname = 'exige_2fa' loop
--       execute format('drop policy exige_2fa on public.%I', t.tablename);
--     end loop;
--   end $$;
--   drop function public.aal_suficiente();
