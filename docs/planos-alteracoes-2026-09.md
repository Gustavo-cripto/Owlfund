# ChainFolioAI — alterações aos planos (6–7 set 2026)

Resumo para quem prepara o lançamento. Tudo o que está aqui **já está em produção** (chainfolioai.com, branch `main`). Commits: `d6a4d69` (custos), `4af2640` (justiça para quem paga), `af401aa` (Conta → Plano), `5e2fde8` (limpeza i18n).

## 1. Preços — NÃO mudaram

| Plano | Mensal | Anual | Cripto (−15 %, EURC) |
|---|---|---|---|
| Free | 0 € | 0 € | — |
| Pro | 14,99 € | 149 € | 12,74 € / 126,65 € |
| Premium | 39 € | 390 € | 33,15 € / 331,50 € |

Fonte única: `src/lib/payments/pricing.ts`. Pagamentos continuam congelados durante a beta (`NEXT_PUBLIC_PAYMENTS_ENABLED` ≠ `"true"` → CTAs apontam para `/beta`). Preços de fundador: o checkout já lê `STRIPE_FOUNDER_PRO_PRICE_ID` / `STRIPE_FOUNDER_PREMIUM_PRICE_ID` (mensal e anual) mas os 4 preços **ainda têm de ser criados no Stripe** antes de ativar pagamentos.

## 2. O que cada plano tem AGORA (verdade do código = verdade do marketing)

### Free (0 €)
- 3 carteiras on-chain (EVM, SOL, BTC, ADA), cold wallets só-leitura
- Watchlist de 3 baleias, histórico das últimas 100 transações
- **3 análises IA por mês** (contador único partilhado entre o chat "Chain" e a análise IA do portefólio) — antes era "1 análise"
- 30 dias de histórico de valor do portefólio
- Snapshots automáticos diários, exportação CSV e PDF/Excel do portefólio (já era assim; agora está escrito)
- Calculadora FIRE **completa** (cenários e projeções sem limite) — antes anunciada como "básica"
- Histórico de trades completo com import/export CSV
- Fiscalidade FIFO com 4 países (PT, ES, FR, DE)
- Preços em tempo real, blocos BTC ao vivo, notícias RSS, suporte por email
- 1 portefólio/conta

### Pro (14,99 €)
Tudo do Free mais:
- Carteiras e baleias ilimitadas; separador de alertas de baleias na app
- CEX (Kraken, Coinbase, OKX, Bybit, Crypto.com, Bitpanda), Hyperliquid, NFTs + DeFi
- Chat "Chain" e análise IA do portefólio **ilimitados**
- Análise IA das notícias, briefing IA diário por email, chat sobre o briefing
- 365 dias de histórico
- 13 países fiscais + exportação fiscal **PDF e Excel** (o PDF fiscal é Pro — a tabela antiga dizia Premium)
- 3 portefólios/contas
- Suporte prioritário

### Premium (39 €)
Tudo do Pro mais:
- Gestor Dedicado IA (chat com os dados reais do portefólio) — **uso razoável: 150 mensagens/dia por conta**
- API REST pública + MCP (Claude, Cursor…) — máx. 5 chaves, 60 pedidos/min, 50 mensagens IA/dia via API
- Webhooks de alertas de baleias (cron diário, assinatura HMAC)
- Smart Money em tempo real (auto-refresh 60 s, sync da watchlist entre dispositivos)
- 21 países fiscais (todos), histórico ilimitado, 10 portefólios/contas
- Acesso antecipado a novas funcionalidades

### Promessas RETIRADAS da tabela (não existem no código — não usar em comunicação)
- "Análise on-chain avançada" (MVRV/NVT…) — os painéis existem mas dizem "a chegar"
- "Gestor de conta dedicado" (humano)
- "Relatório fiscal anual automático"
- "Relatório PDF automático" (o único automático é o briefing por email, que é Pro)
- "Alertas por email" e "alertas de variação de preço" (toggles retirados da Conta; não havia código de envio)
- Níveis de histórico de baleias 10/100/ilimitado (é 100 para todos)
- "3 cenários FIRE" no Free (não há limite)

## 3. O que foi fechado no servidor (custos)

Antes, várias funcionalidades "Pro/Premium" eram só escondidas na UI; o servidor respondia a qualquer sessão (ou a ninguém autenticado). Agora:

| Rota | Antes | Agora |
|---|---|---|
| `/api/portfolio-ai` | qualquer sessão, sem limite mensal | quota Free (3/mês) + 10/min por utilizador |
| `/api/market-chat` | qualquer sessão | Pro/Premium (403 `requires_pro`) + 15/min |
| `POST /api/news-briefing`, `POST /api/market-news` | **abertos à internet** | sessão + Pro/Premium + 10/min |
| Cron do briefing por email | enviava a quem tinha `enabled=true` | reverifica o plano; lapsos são desligados |
| `/api/traditional` (Twelve Data) | sem sessão, cache 2 min | sessão + 30/min, cache 5 min |
| `/api/defi-balance`, `/api/nft-balance` (Moralis) | sem sessão | sessão + 60/min |
| `/api/chat`, API v1/MCP | abriam se a BD falhasse | **falham fechado** (503 `unavailable`) |
| `/api/gestor`, `/api/smart-money-rt` | 403 a Premium legítimo com 2 subscrições ativas (bug) | leitura correta do plano (`getPlan`) |

Ponto único de decisão: `src/lib/api/entitlement.ts` (`getPlan`, `activeSubscribers`, `checkAiQuota`, `incrementAiUsage`, `requiresPlanResponse`). Limites numéricos: `src/lib/plans.ts` (`FREE_AI_LIMIT=3`, `FREE_WALLET_LIMIT=3`, `FREE_WHALE_LIMIT=3`, `ACCOUNT_LIMITS={free:1,pro:3,premium:10}`, `API_CHAT_PER_DAY=50`, `GESTOR_DAILY_LIMIT=150`).

## 4. Textos atualizados (pt/en/es/fr)
- Dashboard (`dash_plan_free_desc`), landing (`lp_plan_free_*`, `lp_plan_pro_3`), `/pricing` (tabela, 3 cartões, comparação com concorrência), Conta → Plano (`ac_f_*`, `ac_p_*`, `ac_pr_*`), Conta → Notificações, Portefólio (mensagens de limite), Gestor IA (mensagens de teto diário).
- 14 chaves de tradução sem uso apagadas.

## 5. Ainda depende do Gustavo (fora do código)
1. Criar os 4 preços de fundador no Stripe e pôr os IDs nas env vars da Vercel.
2. Twelve Data: o plano gratuito (8 créditos/min, partilhados por todos os utilizadores) aguenta a beta com a cache de 5 min; para dezenas de utilizadores ativos é preciso o plano pago.
3. Beta: testers manuais recebem 60 dias (Pro ou Premium) via `grantTester`; expiram para Free automaticamente (cron diário).

## 6. Sugestões para a comunicação de lançamento
- Vender o Free pelo que tem de forte: FIRE completo, histórico de trades, exports, 3 análises IA/mês.
- Pro = "o investidor ativo": carteiras/baleias ilimitadas, CEX, briefing IA, 13 países, PDF/Excel fiscal.
- Premium = "profissional/dev": Gestor IA, API/MCP, webhooks, Smart Money RT, 21 países.
- Não prometer: on-chain avançada, gestor humano, relatórios automáticos, alertas por email de preço.
