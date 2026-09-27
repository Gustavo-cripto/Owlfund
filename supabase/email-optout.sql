-- Exclusão dos emails do produto (boas-vindas, lembrete de carteira,
-- inatividade, oferta de fundador). Uma linha = "não me enviem mais".
--
-- PORQUÊ: o cabeçalho List-Unsubscribe apontava para uma página atrás do
-- login e o cron não consultava lista nenhuma — quem carregava em "anular
-- subscrição" continuava a receber. Agora a rota pública assinada
-- /api/email/unsubscribe e o interruptor em Conta → Notificações escrevem
-- aqui, e o cron (src/app/api/cron/beta-expiry) lê a tabela uma vez e salta
-- estes utilizadores. Os avisos de fim de trial continuam a ir (transacionais).
--
-- QUANDO CORRER: uma vez, no editor de SQL do Supabase (projeto owlfund),
-- antes ou depois do deploy — o código tolera a tabela ainda não existir
-- (regista o erro e não exclui ninguém).
--
-- ACESSO: só o service_role (a API escreve em nome do utilizador com sessão
-- ou com o URL assinado). Nem anon nem authenticated tocam nisto.

create table if not exists public.email_optout (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.email_optout enable row level security;
-- Sem políticas: com RLS ligado e nenhuma política, anon/authenticated não
-- leem nem escrevem; o service_role ignora RLS.
revoke all on public.email_optout from anon, authenticated;
