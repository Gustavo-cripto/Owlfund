-- Reserva atómica da quota mensal de análises de IA do plano gratuito.
--
-- PORQUÊ: a contagem era feita em duas viagens — ler o contador no Node, e mais
-- tarde escrever `contador + 1`. Entre uma coisa e outra passavam 15 a 25
-- segundos, que é o tempo da chamada ao fornecedor de IA. Trinta pedidos
-- disparados ao mesmo tempo liam todos zero, passavam todos, faziam todas as
-- trinta chamadas pagas, e escreviam todos "1". O limite de 3 análises por mês
-- do plano gratuito deixava de existir, e a factura era do dono.
--
-- A correcção é o mesmo padrão que api_rate_check (supabase-rate-limits.sql)
-- já usava: o incremento acontece DENTRO do Postgres, numa só instrução, e o
-- valor que interessa é o que o Postgres devolve — nunca um recalculado fora.
--
-- Correr uma vez no editor de SQL do Supabase.

-- Reserva uma análise e devolve o total do mês DEPOIS de a reservar.
-- Quem chama compara com o limite: se o valor devolvido passar do limite, a
-- reserva não é para usar (e deve ser libertada).
create or replace function public.chat_usage_reserve(
  p_user_id uuid,
  p_month text
) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into public.chat_usage (user_id, month, count, updated_at)
    values (p_user_id, p_month, 1, now())
    on conflict (user_id, month)
    do update set count = chat_usage.count + 1, updated_at = now()
    returning count into v_count;

  return v_count;
end;
$$;

-- Devolve uma análise reservada, quando o fornecedor de IA falhou e não houve
-- resposta nenhuma. Também atómico: um upsert com valor absoluto traria o
-- mesmo defeito de volta.
create or replace function public.chat_usage_release(
  p_user_id uuid,
  p_month text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_usage
    set count = greatest(count - 1, 0), updated_at = now()
    where user_id = p_user_id and month = p_month;
end;
$$;

-- `security definer` sem isto ficaria executável pelo papel `authenticated`, e
-- um utilizador podia gastar ou inspeccionar o contador de qualquer conta.
revoke all on function public.chat_usage_reserve(uuid, text) from public, anon, authenticated;
revoke all on function public.chat_usage_release(uuid, text) from public, anon, authenticated;
grant execute on function public.chat_usage_reserve(uuid, text) to service_role;
grant execute on function public.chat_usage_release(uuid, text) to service_role;
