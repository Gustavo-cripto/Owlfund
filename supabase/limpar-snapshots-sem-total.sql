-- Limpeza única: apaga os snapshots SEM valor total (_totalEur) que sejam mais
-- recentes do que o último snapshot COM valor total, por utilizador.
--
-- Porquê: até setembro de 2026 a página de Carteiras inseria uma linha em
-- portfolio_snapshots a cada visita (Pro/Premium), só com as listas de
-- carteiras — sem _totalEur nem _account. Esses snapshots contavam como
-- "fresco" e bloqueavam o auto-snapshot de 24 h do Portefólio e o PNL da
-- API/MCP; o cron diário copiava-os. O código deixou de os gravar
-- (auditoria set 2026, lote A) e o Portefólio/cron já só usam como "último" um
-- snapshot com total; este ficheiro devolve a essas contas o auto-snapshot.
--
-- Quando correr: uma vez, no SQL Editor do Supabase (projeto de produção),
-- DEPOIS do deploy do lote A. Primeiro a contagem (1), depois o DELETE (2).
-- Não toca em snapshots anteriores ao último com total (podem ser histórico
-- real de antes de _totalEur existir), nem em utilizadores que nunca tiveram
-- um snapshot com total.
--
-- A coluna `data` é jsonb. Se for json, trocar `data` por `data::jsonb`.

-- 1) Ver quantas linhas vão sair, por utilizador.
select s.user_id, count(*) as a_apagar
from public.portfolio_snapshots s
join (
  select user_id, max(created_at) as ultimo_com_total
  from public.portfolio_snapshots
  where jsonb_typeof(data -> '_totalEur') = 'number'
  group by user_id
) u on u.user_id = s.user_id
where s.created_at > u.ultimo_com_total
  and jsonb_typeof(s.data -> '_totalEur') is distinct from 'number'
group by s.user_id
order by a_apagar desc;

-- 2) Apagar.
delete from public.portfolio_snapshots s
using (
  select user_id, max(created_at) as ultimo_com_total
  from public.portfolio_snapshots
  where jsonb_typeof(data -> '_totalEur') = 'number'
  group by user_id
) u
where u.user_id = s.user_id
  and s.created_at > u.ultimo_com_total
  and jsonb_typeof(s.data -> '_totalEur') is distinct from 'number';
