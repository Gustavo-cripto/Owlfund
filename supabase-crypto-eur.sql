-- Valor em euros de cada pagamento em cripto, à cotação do momento (contabilista,
-- 20 out 2026: a fatura-recibo sai em euros). Correr UMA vez no SQL Editor do
-- Supabase antes de abrir os pagamentos em cripto. Sem estas colunas o site
-- continua a funcionar; só não guarda o valor em euros no pagamento.
alter table public.crypto_payments add column if not exists valor_eur numeric;
alter table public.crypto_payments add column if not exists cotacao_eur numeric;
alter table public.crypto_payments add column if not exists cotacao_fonte text;
