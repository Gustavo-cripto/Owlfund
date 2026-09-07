# ChainFolioAI — runbook do lançamento (abrir pagamentos)

Sequência para passar do beta (pagamentos congelados) ao lançamento. Cada passo
diz **quem** faz (Gustavo = contas externas; Claude = código/verificação) e como
se confirma. Não há segredos neste ficheiro — o repositório é público.

Estado de partida (set 2026): site em produção, beta com testers Premium 60 dias,
`NEXT_PUBLIC_PAYMENTS_ENABLED` desligada, Stripe em modo TEST, cripto (Helio)
desligado. Preços: Pro 14,99 €/149 €, Premium 39 €/390 €; fundadores Pro 9,99 €,
Premium 19 € (vitalícios) — prometidos por email aos testers.

---

## 0. Antes de tudo — decisões (Gustavo)

- [ ] **Entidade legal** (nome próprio / unipessoal / Lda.). O KYC do Stripe pergunta-a e os Termos precisam dela.
- [ ] Enviar `legalidade/revisao-juridica.md` ao advogado e `legalidade/informacao-contabilista.md` ao contabilista (pasta ignorada pelo git).
- [ ] Data-alvo do lançamento (para agendar o KYC 1–3 dias úteis antes).

## 1. Stripe em modo Live (Gustavo, 1–3 dias úteis antes)

1. Dashboard Stripe → **Ativar conta** (KYC com a entidade do passo 0).
2. Assim que a conta ficar Live: **Developers → API keys → rodar a `sk_live_…` antiga** (esteve exposta em julho; expirar de imediato) e copiar a nova.
3. **Produtos → criar os preços LIVE** (os de teste não servem em produção):

   | Produto | Preço | Intervalo | Env var na Vercel |
   |---|---|---|---|
   | ChainFolioAI Pro | 14,99 € | mensal | `STRIPE_PRICE_ID` |
   | ChainFolioAI Pro | 149 € | anual | `STRIPE_PRICE_ID_ANNUAL` |
   | ChainFolioAI Premium | 39 € | mensal | `STRIPE_PREMIUM_PRICE_ID` (+ `NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID` com o mesmo valor) |
   | ChainFolioAI Premium | 390 € | anual | `STRIPE_PREMIUM_PRICE_ID_ANNUAL` |
   | Pro Fundador | 9,99 € | mensal | `STRIPE_FOUNDER_PRO_PRICE_ID` |
   | Pro Fundador | 99 € | anual | `STRIPE_FOUNDER_PRO_PRICE_ID_ANNUAL` |
   | Premium Fundador | 19 € | mensal | `STRIPE_FOUNDER_PREMIUM_PRICE_ID` |
   | Premium Fundador | 190 € | anual | `STRIPE_FOUNDER_PREMIUM_PRICE_ID_ANNUAL` |

   Os valores anuais de fundador (99 €/190 €) seguem a regra "≈2 meses grátis" dos planos normais; se preferires outros, muda aqui e nos emails do cron `beta-expiry` (só mencionam os mensais).
4. **Developers → Webhooks → Add endpoint** (modo Live): `https://chainfolioai.com/api/stripe/webhook`, eventos `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`. Copiar o **Signing secret** → `STRIPE_WEBHOOK_SECRET`.
5. **Vercel → projeto chainfolioai → Settings → Environment Variables (Production)**: substituir `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` e os 8 price IDs da tabela pelos valores LIVE. **Ainda não** mexer em `NEXT_PUBLIC_PAYMENTS_ENABLED`.
6. Redeploy (Deployments → ⋯ → Redeploy) para as env vars entrarem.

**Verificar (Claude ou tu):** `ADMIN_STATS_TOKEN=… ./scripts/launch-check.sh` — bloco "Pagamentos" e "Fundador" todos ✅, `secretKeyIsLive=true`, `paymentsEnabled=false`.

## 2. Ensaio com pagamentos ainda congelados (Claude)

- O código reconhece Premium por **4** price IDs (mensal, anual, fundador mensal/anual) via `src/lib/payments/priceIds.ts` — confirmado por `tsc` e pelo check.
- Simular no Stripe (modo Live, cartão de teste não existe — usar um cupão de 100 % ou um preço de 0 € temporário) **ou** aceitar o primeiro pagamento real como teste com a tua própria conta e reembolsar.
- Confirmar em `/admin/beta` e em `/api/v1/admin/stats` que o `planLabel` mostra `premium_mensal`/`fundador_premium_mensal` conforme o preço.

## 3. Dia do lançamento (Gustavo + Claude)

1. Vercel → `NEXT_PUBLIC_PAYMENTS_ENABLED=true` → Redeploy. É o único interruptor: `/pricing` troca o convite ao beta pelos botões de upgrade e `/api/stripe/checkout` deixa de responder 403.
2. `./scripts/launch-check.sh` → `paymentsEnabled=true`; abrir `/pricing` numa janela anónima e ver os botões.
3. Um checkout real de 9,99 € com a conta fundadora de teste → confirmar que a subscrição aparece com o plano certo → reembolsar no Stripe se for só teste.
4. Email/Telegram aos testers e fundadores: "pagamentos abertos, o teu preço de fundador aplica-se automaticamente no checkout" (texto a preparar na altura; a reserva de fundador já está na tabela `founders`).
5. Fechar inscrições do beta quando quiseres: `NEXT_PUBLIC_BETA_CUTOFF` já está a 2026-11-05; os testers ativos mantêm os 60 dias.

## 4. Escalar fornecedores (quando houver dezenas de utilizadores)

- **Twelve Data** — plano gratuito = 8 créditos/min partilhados por todos (cache de 5 min no servidor). Sinal de alarme: cotações a aparecer como "desatualizadas" na página de Carteiras/Mercado. Solução: plano pago, mesma `TWELVEDATA_API_KEY`.
- **Resend** — 100 emails/dia no gratuito; o briefing diário vai a todos os Pro/Premium. Sinal: cron `news-briefing` com `errors` no log. Solução: plano pago.
- **Alchemy** (fornecedor principal EVM: saldos com preços, NFTs, transferências das baleias) — plano gratuito com 300 M CU/mês; ver consumo em dashboard.alchemy.com. **Moralis** ficou como alternativa: o plano gratuito terminou em set 2026 (Starter 149 $/mês) — só volta a ser usada se `MORALIS_API_KEY` tiver plano ativo. **Helius** (Solana: saldos, NFTs, movimentos) — ver quota no dashboard.

## 5. Cripto (opcional, sem data)

Conta Helio + KYB → carteiras de receção (BTC, EVM, Solana) → 4 Pay Links com os preços em EURC (12,74 / 126,65 / 33,15 / 331,50) → env vars `HELIO_PUBLIC_KEY`, `HELIO_API_KEY`, `HELIO_WEBHOOK_TOKEN`, `HELIO_PAYLINK_*` → correr `supabase-crypto-payments.sql` (se ainda não) → `NEXT_PUBLIC_CRYPTO_PAYMENTS_ENABLED=true` → redirect do Pay Link para `https://chainfolioai.com/crypto/confirm`. Depois do 1.º webhook real, confirmar os campos em `src/lib/payments/helio.ts`.

## 6. Reverter (se algo correr mal no dia)

`NEXT_PUBLIC_PAYMENTS_ENABLED=false` + Redeploy volta a congelar tudo em ~1 minuto. Subscrições já criadas ficam válidas (o webhook continua a funcionar).
