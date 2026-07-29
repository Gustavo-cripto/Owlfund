# Plano — Pagamentos em cripto (ChainFolioAI)

> Objetivo: permitir pagar os planos **Pro** e **Premium** (mensal ou anual) em
> cripto — **BTC e ETH** já, **mais redes depois** — a funcionar de forma fiável
> e com alta segurança, sem custódia de chaves e sem partir o gating de planos
> que já existe (Stripe).

Estado: **plano aprovado? (pendente)** · Autor: sessão de planeamento · Última revisão: 2026-07-29

---

## 0. Realidades que moldam o desenho (honestidade primeiro)

1. **Recorrência automática só existe em cadeias programáveis.**
   - **ETH/EVM e Solana:** dá para débito automático (aprovação/delegação on-chain). UX igual à do Helius.
   - **BTC:** **não** tem débito automático nativo. Fica **pré-pago por período + renovação manual** (com lembrete), ou modelo "saldo pré-pago" (BTCPay).
2. **Volatilidade:** cobrar em BTC/ETH obriga a travar cotação e a lidar com sub/sobre-pagamento. **Cobrar em USDC** (stablecoin) elimina isto e é a norma do mercado. Recomendação: **preços em USDC**, aceitando BTC/ETH como forma de pagar quando a rede o permitir.
3. **Sem chargebacks:** cripto é irreversível. Bom para o comerciante, mas reembolsos são manuais → precisa de política clara.
4. **Coinbase Commerce está fora** (encerrou para a UE em 03/2026, nunca teve recorrência).

---

## 1. Escolha de processador (decisão-chave)

| Critério | **Helio / MoonPay Commerce** | **Sphere** | **BTCPay Server** |
|---|---|---|---|
| Redes | BTC, ETH, SOL (+) | ETH/Base/Polygon/SOL | BTC + Lightning (EVM via plugin) |
| Recorrência | Sim (API subscrições) | Sim (stablecoin, multi-chain) | "Saldo pré-pago" / manual |
| Custódia | Não-custodial (→ tua carteira) | Liquida USDC p/ ti | Não-custodial (self-host) |
| KYC | Provável (MoonPay) | Merchant onboarding | Nenhum |
| Stablecoin (USDC) | Sim | Sim (núcleo) | Via plugin |
| Esforço integração | Médio (API + webhooks) | Médio | Alto (correr servidor) |
| Custo | Fee % por transação | Fee % | Infra ~€5/mês, 0% fees |

**Recomendação:** **Helio (MoonPay Commerce)** como processador primário — é o único que cobre **BTC + ETH + SOL**, é **não-custodial** (alinha com a identidade da app), tem **API de subscrições + webhooks** e liquida direto para a tua carteira. Preços em **USDC**.

**Alternativa soberana:** se a prioridade for **zero KYC + auto-custódia total**, **BTCPay Server** para BTC + **Sphere** para ETH/USDC recorrente. Custo: mais infra e 2 integrações.

> **Due diligence Fase 0 (antes de codar):** confirmar em Helio — disponibilidade para comerciante **UE/Portugal**, **fees** exatas, **KYC** exigido, se **BTC** é one-time e **ETH/SOL** recorrente, formato de **webhooks + assinatura**, e **redes/moedas** exatas. Só depois se fecha o processador.

---

## 2. Arquitetura (encaixe no que já existe)

O plano é resolvido hoje pela tabela **`subscriptions`** (`user_id, status, price_id`) via webhooks do Stripe; helpers `isUserPremium` / `/api/subscription` derivam Free/Pro/Premium.

**Estratégia: reutilizar a mesma tabela.** Um pagamento cripto cria/atualiza uma linha em `subscriptions` com:
- `status = "active"`, `price_id` = o mesmo ID lógico de Pro/Premium,
- `source = "crypto"`, `current_period_end = agora + período`,
- metadados cripto numa tabela satélite.

**Resultado:** **todo o gating existente continua a funcionar sem alterações** (o resolver só olha para `status` + `price_id`). Um cron marca `status = "canceled"` quando `current_period_end` passa.

### Alterações de esquema (Supabase)
```sql
-- Coluna de origem na tabela existente (Stripe vs cripto)
alter table subscriptions add column if not exists source text default 'stripe';
alter table subscriptions add column if not exists current_period_end timestamptz;

-- Tabela satélite: histórico/auditoria de pagamentos cripto (idempotência)
create table if not exists crypto_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,               -- 'helio' | 'btcpay' | 'sphere'
  provider_event_id text unique,        -- idempotência (webhook)
  plan text not null,                   -- 'pro' | 'premium'
  period text not null,                 -- 'monthly' | 'annual'
  chain text not null,                  -- 'BTC' | 'ETH' | 'SOL' | ...
  currency text not null,               -- 'USDC' | 'BTC' | 'ETH'
  amount numeric not null,
  tx_hash text,
  status text not null,                 -- 'pending'|'confirmed'|'expired'|'failed'
  created_at timestamptz default now(),
  confirmed_at timestamptz
);
-- RLS: cada utilizador só vê os seus; escrita só via service role (webhook).
```

---

## 3. Fluxos

### 3.1 Checkout
1. Utilizador em `/pricing` escolhe plano (Pro/Premium) + período (mensal/anual) → clica **"Pagar com cripto"**.
2. Backend `POST /api/crypto/checkout` cria a fatura no processador (valor em USDC, metadados `user_id/plan/period`), devolve URL/dados de checkout.
3. UI mostra checkout do processador (wallet-connect + QR) — igual ao exemplo do Helius.
4. Utilizador paga com a carteira dele.

### 3.2 Webhook (crédito de acesso)
1. Processador chama `POST /api/crypto/webhook` ao confirmar.
2. **Verificar assinatura** do webhook (segredo do processador).
3. **Idempotência:** `insert ... on conflict (provider_event_id) do nothing`. Se já existia → ignora.
4. Validar `plan/period/amount` contra o esperado.
5. `upsert` em `subscriptions`: `status=active`, `price_id` do plano, `source='crypto'`, `current_period_end = agora + período`.
6. Registar em `crypto_payments` com `status='confirmed'`, `tx_hash`.

### 3.3 Renovação e expiração
- **Auto-recorrente (ETH/SOL via processador):** o processador cobra e reenvia webhook → estende `current_period_end`.
- **Manual (BTC):** cron diário (`/api/cron/crypto-expiry`) verifica `current_period_end`; envia email de aviso a T-7/T-1 dias (Resend); ao expirar, `status='canceled'` → volta a Free.
- Reaproveitar o cron/infra que já existe para snapshots/briefing.

### 3.4 Falhas / reembolsos
- Sub-pagamento → fatura fica `pending`; instrução para completar; expira em ~15 min.
- Sem chargebacks → política de reembolso manual documentada nos Termos.

---

## 4. Checklist de segurança (obrigatória)
- [ ] **Nunca** guardar chaves privadas nem seed — só endereços/config do processador.
- [ ] Segredos do processador em **env vars** (Vercel), nunca no repo. (ver [[no-hardcoded-secrets]])
- [ ] **Verificar assinatura** de todos os webhooks; rejeitar sem assinatura válida.
- [ ] **Idempotência** por `provider_event_id` (nunca creditar 2×).
- [ ] Validar **valor, plano e período** recebidos vs esperado antes de creditar.
- [ ] Escrita em `subscriptions`/`crypto_payments` só via **service role** (server-side), nunca do cliente.
- [ ] RLS no Supabase: utilizador só lê os seus registos.
- [ ] Rate-lock da cotação (se cobrar em BTC/ETH) com expiração curta.
- [ ] Confirmações mínimas por rede (BTC ≥1–2; ETH conforme finalidade) — delegado ao processador.
- [ ] Logs de auditoria de cada evento de pagamento.
- [ ] Feature flag para ativar/desativar o pagamento cripto sem deploy.

---

## 5. UI/UX
- **/pricing:** toggle "Cartão (Stripe) | Cripto" no seletor de plano; badge "Pago em USDC".
- **/account:** mostrar subscrição ativa por cripto, rede, `tx_hash`, data de renovação e botão "Renovar" (para BTC manual).
- **Checkout:** página/redirect para o processador; estado "à espera de confirmação" → "confirmado ✓".
- **i18n:** novas chaves nos 4 idiomas (pt/en/es/fr) para todos os textos novos.
- Aviso: o auto-translate do browser pode baralhar checkouts embutidos (nomes de carteiras) — preferir redirect ou iframe do processador.

---

## 6. O que só o utilizador pode fazer (não posso por segurança)
1. **Criar a conta do processador** (Helio/MoonPay Commerce) + KYC de comerciante.
2. **Indicar a carteira de recebimento** (BTC + ETH) que ele controla.
3. Decidir **preços em USDC** (ex.: Pro 14,99 USDC / Premium 39 USDC; anual com 2 meses grátis).
4. Rever **Termos** (política de reembolso cripto, sem chargebacks) — liga ao ponto legal pendente do lançamento.
5. Fornecer os **segredos** (API key + webhook secret) para as env vars do Vercel.

---

## 7. Testes
- Sandbox/testnet do processador (fluxo completo checkout → webhook → acesso).
- Replay de webhook (idempotência), assinatura inválida (rejeição), sub-pagamento, expiração.
- Verificar que o gating de planos (Pro/Premium) reage igual ao Stripe.
- Cron de expiração: simular `current_period_end` no passado.

---

## 8. Faseamento
- **Fase 0 — Due diligence** do processador (UE, fees, KYC, recorrência por rede, webhooks). *(gate)*
- **Fase 1 — Base (independente do processador):** migração SQL (`source`, `current_period_end`, `crypto_payments`), helper de resolução de plano unificado, cron de expiração, feature flag. *(posso fazer já)*
- **Fase 2 — Integração processador:** `/api/crypto/checkout` + `/api/crypto/webhook` + UI de checkout, para **BTC + ETH** (USDC).
- **Fase 3 — Renovação/emails** (avisos T-7/T-1, botão renovar) + `/account`.
- **Fase 4 — Mais redes** (SOL e outras) + polimento.

---

## 9. Decisões CONFIRMADAS (2026-07-29)
1. **Processador: Helio / MoonPay Commerce** (não-custodial, cobre BTC+ETH+SOL).
2. **Preço fixado em EURC**; **stablecoins aceites: EURC + USDC** (cliente pode pagar com outras, Helio converte).
3. **Fiat mantém-se** (Pro €14,99/€149 · Premium €39/€390) para cartão/Stripe.
4. **Desconto cripto: 15%** (alterável em `src/lib/payments/pricing.ts` ou env `NEXT_PUBLIC_CRYPTO_DISCOUNT_PCT`).
   Preços cripto (EURC): Pro **12,74** / **126,65** · Premium **33,15** / **331,50**.
5. **Recebimento: direto nas cold wallets do utilizador**, **sempre em cripto** (sem auto-offramp para fiat).
6. **BTC** entra como pré-pago + renovação manual (sem débito automático); **ETH/SOL** podem auto-renovar.

### Ainda a definir pelo utilizador
- Endereços de recebimento por rede (BTC + ETH/EVM + Solana) — dar ao configurar os Pay Links.
- Conta Helio + KYB (opcional no tier básico não-custodial).
