-- Domínio de origem de cada visita (so o dominio do Referer, nunca o URL).
--
-- Serve para saber de onde chega o trafego que nao vem com ?src= (ex.: as
-- visitas de /en). O middleware ja envia `ref` para /api/track; sem esta coluna
-- a visita conta na mesma, so sem o dominio. Correr uma vez no SQL Editor do
-- Supabase (projeto owlfund). Seguro de repetir.
alter table public.page_views add column if not exists ref text;
create index if not exists page_views_ref_idx on public.page_views (ref) where ref is not null;
