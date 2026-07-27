-- Run this in Supabase SQL editor to enable API rate limiting.
-- Contador de janela fixa por chave. Só o service role (rotas da API) escreve;
-- os utilizadores não têm acesso (RLS ativa, sem políticas = negar tudo).

create table if not exists public.api_rate_limits (
  key_hash text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key_hash, window_start)
);

alter table public.api_rate_limits enable row level security;

-- Incrementa atomicamente o contador da janela atual e diz se ainda está
-- dentro do limite. Chamada pelo service role via rpc("api_rate_check", …).
create or replace function public.api_rate_check(
  p_key_hash text,
  p_limit int,
  p_window_seconds int
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window timestamptz;
  v_count int;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.api_rate_limits (key_hash, window_start, count)
    values (p_key_hash, v_window, 1)
    on conflict (key_hash, window_start)
    do update set count = api_rate_limits.count + 1
    returning count into v_count;

  return v_count <= p_limit;
end;
$$;

-- (Opcional) limpeza de janelas antigas — corre de vez em quando ou por cron:
-- delete from public.api_rate_limits where window_start < now() - interval '1 day';
