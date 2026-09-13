-- Atribuicao por canal: de onde vem cada visita.
--
-- O middleware ja envia `src` (de ?src=reddit ou ?utm_source=…) para /api/track;
-- sem esta coluna a visita conta na mesma, mas sem origem. Correr uma vez no
-- SQL Editor do Supabase (projeto owlfund). Seguro de repetir.
alter table public.page_views add column if not exists src text;
create index if not exists page_views_src_idx on public.page_views (src) where src is not null;
