#!/usr/bin/env bash
# Verificação de prontidão para o lançamento — corre contra produção.
#
#   ADMIN_STATS_TOKEN=... ./scripts/launch-check.sh            (chainfolioai.com)
#   ADMIN_STATS_TOKEN=... ./scripts/launch-check.sh https://preview-url.vercel.app
#
# 1) Rotas pagas fechadas a quem não tem sessão (401) — custo controlado.
# 2) Estado das env vars do lançamento (só sim/não) via /api/v1/admin/stats.
# Não altera nada; só lê.

set -u
BASE="${1:-https://chainfolioai.com}"
TOKEN="${ADMIN_STATS_TOKEN:-}"
ok=0; bad=0

check() { # descrição, esperado (pode ser "401|403"), código obtido
  if echo "$3" | grep -Eq "^($2)$"; then printf "  ✅ %-52s %s\n" "$1" "$3"; ok=$((ok+1));
  else printf "  ❌ %-52s %s (esperado %s)\n" "$1" "$3" "$2"; bad=$((bad+1)); fi
}
code() { curl -s -o /dev/null -w "%{http_code}" "$@"; }
J='Content-Type: application/json'

echo "── 1) Rotas com custo, sem sessão → 401 ($BASE)"
check "POST /api/portfolio-ai"   401 "$(code -X POST -H "$J" -d '{"question":"x","context":{}}' "$BASE/api/portfolio-ai")"
check "POST /api/market-chat"    401 "$(code -X POST -H "$J" -d '{"briefing":"x","mode":"crypto","messages":[{"role":"user","content":"x"}]}' "$BASE/api/market-chat")"
check "POST /api/news-briefing"  401 "$(code -X POST -H "$J" -d '{"items":[],"lang":"pt"}' "$BASE/api/news-briefing")"
check "POST /api/market-news"    401 "$(code -X POST -H "$J" -d '{"mode":"crypto","lang":"pt"}' "$BASE/api/market-news")"
check "POST /api/gestor"         401 "$(code -X POST -H "$J" -d '{"messages":[{"role":"user","content":"x"}]}' "$BASE/api/gestor")"
check "GET  /api/smart-money-rt" 401 "$(code "$BASE/api/smart-money-rt?watchlist=[]")"
check "GET  /api/traditional"    401 "$(code "$BASE/api/traditional?symbols=AAPL")"
check "GET  /api/defi-balance"   401 "$(code "$BASE/api/defi-balance?address=0x0000000000000000000000000000000000000001&chain=eth")"
check "GET  /api/nft-balance"    401 "$(code "$BASE/api/nft-balance?address=0x0000000000000000000000000000000000000001&chain=eth")"
check "GET  /api/token-balances" 401 "$(code "$BASE/api/token-balances?address=0x0000000000000000000000000000000000000001&chain=eth")"
check "GET  /api/v1/whales (chave inválida)" 401 "$(code -H 'Authorization: Bearer cfa_live_0000000000000000000000000000000000000000' "$BASE/api/v1/whales")"
check "GET  /api/cron/beta-expiry (sem segredo)" 401 "$(code "$BASE/api/cron/beta-expiry")"
check "POST /api/stripe/checkout (sem sessão; 403 = congelado)" "401|403" "$(code -X POST -H "$J" -d '{"plan":"pro"}' "$BASE/api/stripe/checkout")"

echo
echo "── 2) Env vars do lançamento (via /api/v1/admin/stats)"
if [ -z "$TOKEN" ]; then
  echo "  ⚠️  ADMIN_STATS_TOKEN não definido — a saltar. Corre: ADMIN_STATS_TOKEN=... $0"
else
  body=$(curl -s -H "Authorization: Bearer $TOKEN" "$BASE/api/v1/admin/stats")
  if ! echo "$body" | grep -q '"launch"'; then
    echo "  ❌ resposta sem bloco launch (token errado ou versão antiga):"; echo "$body" | head -c 300; echo; bad=$((bad+1))
  else
    python3 - "$body" <<'PY'
import json, sys
d = json.loads(sys.argv[1])["launch"]
def row(label, val, want=True, note=""):
    mark = "✅" if val == want else ("⚠️ " if want is None else "❌")
    print(f"  {mark} {label:<52} {val}{('  ' + note) if note else ''}")
s = d["stripe"]; p = s["prices"]; f = s["founderPrices"]; pr = d["providers"]; c = d["crypto"]; o = d["ops"]
print("  Pagamentos:")
row("NEXT_PUBLIC_PAYMENTS_ENABLED=true", d["paymentsEnabled"], None, "(ligar só no dia)")
row("STRIPE_SECRET_KEY definida", s["secretKey"])
row("STRIPE_SECRET_KEY é LIVE (sk_live_)", s["secretKeyIsLive"], None, "(true só no lançamento)")
row("STRIPE_WEBHOOK_SECRET", s["webhookSecret"])
row("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", s["publishableKey"])
row("STRIPE_PRICE_ID (Pro mensal)", p["proMonthly"])
row("STRIPE_PRICE_ID_ANNUAL (Pro anual)", p["proAnnual"])
row("STRIPE_PREMIUM_PRICE_ID (Premium mensal)", p["premiumMonthly"])
row("STRIPE_PREMIUM_PRICE_ID_ANNUAL (Premium anual)", p["premiumAnnual"])
row("NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID (espelho)", p["premiumPublicMirror"])
print("  Fundador (emails prometem Pro €9,99 / Premium €19):")
row("STRIPE_FOUNDER_PRO_PRICE_ID", f["proMonthly"])
row("STRIPE_FOUNDER_PRO_PRICE_ID_ANNUAL", f["proAnnual"])
row("STRIPE_FOUNDER_PREMIUM_PRICE_ID", f["premiumMonthly"])
row("STRIPE_FOUNDER_PREMIUM_PRICE_ID_ANNUAL", f["premiumAnnual"])
print("  Fornecedores:")
for k, lbl in [("ai","IA (Groq/OpenAI/xAI)"),("resend","Resend"),("twelveData","Twelve Data"),("alchemy","Alchemy (EVM: saldos/NFTs/transfers)"),("moralis","Moralis (alternativa, plano pago)"),("helius","Helius"),("etherscan","Etherscan (V2, obrigatória p/ histórico ETH)")]:
    row(lbl, pr[k])
print("  Operações:")
row("CRON_SECRET", o["cronSecret"]); row("ADMIN_EMAILS", o["adminEmails"]); row("Telegram (token + chat id)", o["telegram"])
print(f"     Fim das inscrições beta: {o['betaCutoff']}")
print("  Cripto (opcional):")
row("NEXT_PUBLIC_CRYPTO_PAYMENTS_ENABLED", c["enabled"], None); row("Helio configurado", c["helioConfigured"], None)
PY
  fi
fi

echo
echo "Resultado: $ok ok · $bad falhas"
[ "$bad" -eq 0 ]
