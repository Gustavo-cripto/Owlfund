// Catálogo ÚNICO da API pública e das ferramentas MCP.
// Consumido por: /developers (documentação), /api/v1 (índice de descoberta)
// e /account (resumo). Ao criar um endpoint novo, acrescenta-o AQUI.

import type { TranslationKey } from "@/lib/i18n/translations";

export const API_BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";

export type ApiEndpoint = {
  id: string;
  method: "GET" | "POST";
  path: string;
  /** Descrição curta em pt-PT (índice /api/v1, sem i18n). */
  desc: string;
  /** Chave traduzida para a documentação. */
  descKey: TranslationKey;
  auth: boolean;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  response: string;
  errors?: string[];
};

export const API_ENDPOINTS: ApiEndpoint[] = [
  { id: "index", method: "GET", path: "/api/v1", desc: "Este índice. Não exige chave.", descKey: "dev_ep_index", auth: false,
    response: `{ "name": "ChainFolioAI API", "version": "v1", "documentation": "${API_BASE}/developers", "endpoints": [ /* … */ ] }` },
  { id: "portfolio", method: "GET", path: "/api/v1/portfolio", desc: "Último snapshot do portefólio: saldos por rede, CEX, DeFi e ativos manuais (endereços pseudonimizados).", descKey: "dev_ep_portfolio", auth: true,
    response: `{
  "updatedAt": "2026-09-05T00:00:00Z",
  "snapshotCount": 365,
  "portfolio": {
    "eth": [{ "address": "wallet_8815840fa2", "balance": "1.5", "network": "eth", "label": "Principal" }],
    "cexUsd": 1000,
    "manualEur": 500
  }
}` },
  { id: "wallets", method: "GET", path: "/api/v1/wallets", desc: "Carteiras e endereços ligados à conta (pseudonimizados).", descKey: "dev_ep_wallets", auth: true,
    response: `{
  "updatedAt": "2026-09-05T00:00:00Z",
  "wallets": {
    "eth": [{ "address": "wallet_8815840fa2", "balance": "1.5", "network": "eth", "label": "Principal" }],
    "btc": [{ "address": "wallet_86ef685f59", "balance": "0.2" }]
  }
}` },
  { id: "whales", method: "GET", path: "/api/v1/whales", desc: "Movimentos on-chain recentes dos endereços dados (?watchlist=<JSON>). ETH, BTC e SOL; máx. 10.", descKey: "dev_ep_whales", auth: true,
    query: { watchlist: '[{"address":"0x…","chain":"eth","label":"Baleia"}]' },
    response: `{
  "movements": [{
    "address": "0x…", "label": "Baleia", "chain": "eth",
    "type": "large_transfer",            // large_transfer | accumulation | distribution | new_token
    "description": "1250.00 USDC", "usdValue": 1250, "timestamp": 1769…
  }],
  "scanned": 1,
  "timestamp": 1769…
}`,
    errors: ["400 missing_watchlist", "400 invalid_watchlist", "400 too_many (>10)", "400 invalid_address", "400 invalid_chain"] },
  { id: "market", method: "GET", path: "/api/v1/market", desc: "Top criptoativos por capitalização (?limit=N, 1–250). Preço, market cap, volume, variação 24h/7d.", descKey: "dev_ep_market", auth: true, query: { limit: "5" },
    response: `{
  "coins": [{ "id": "bitcoin", "rank": 1, "symbol": "BTC", "name": "Bitcoin", "priceUsd": 64000, "marketCap": 1.29e12, "volume24h": 3.1e10, "change24h": -0.2, "change7d": 1.5 }],
  "count": 5, "source": "coingecko", "timestamp": 1769…
}` },
  { id: "known-whales", method: "GET", path: "/api/v1/known-whales", desc: "Baleias conhecidas pré-carregadas (exchanges, fundos, figuras, governos).", descKey: "dev_ep_known_whales", auth: true,
    response: `{ "whales": [{ "address": "0x47ac…D503", "label": "Binance Cold Wallet", "chain": "eth" }], "count": 50 }` },
  { id: "price", method: "GET", path: "/api/v1/price", desc: "Preço, capitalização, volume e variação de um criptoativo (?symbol=btc). 404 se não existir.", descKey: "dev_ep_price", auth: true, query: { symbol: "btc" },
    response: `{ "symbol": "BTC", "name": "Bitcoin", "priceUsd": 64000, "marketCap": 1.29e12, "volume24h": 3.1e10, "change24h": -0.2, "change7d": 1.5, "rank": 1 }`,
    errors: ["404 not_found"] },
  { id: "fear-greed", method: "GET", path: "/api/v1/fear-greed", desc: "Índice Fear & Greed (atual + últimos 8 dias).", descKey: "dev_ep_fear_greed", auth: true,
    response: `{ "now": { "value": 29, "classification": "Fear", "timestamp": 1769… }, "history": [ /* últimos 8 dias */ ] }` },
  { id: "news", method: "GET", path: "/api/v1/news", desc: "Últimas notícias de cripto (?limit=N, 1–30).", descKey: "dev_ep_news", auth: true, query: { limit: "10" },
    response: `{ "news": [{ "title": "…", "url": "https://…", "source": "CoinDesk", "publishedAt": "2026-09-05T…" }], "count": 10 }` },
  { id: "btc-blocks", method: "GET", path: "/api/v1/btc-blocks", desc: "Blocos Bitcoin recentes + taxas da mempool.", descKey: "dev_ep_btc_blocks", auth: true,
    response: `{
  "blocks": [{ "height": 958892, "txCount": 4448, "medianFee": 2, "pool": "Foundry USA", "timestamp": 1769… }],
  "fees": { "fastestFee": 3, "halfHourFee": 2, "hourFee": 2, "economyFee": 1, "minimumFee": 1 },
  "timestamp": 1769…
}` },
  { id: "fire", method: "GET", path: "/api/v1/fire", desc: "Anos até à independência financeira (regra dos 4%). Defaults 2000/500/7/3/30/0.", descKey: "dev_ep_fire", auth: true,
    query: { monthlyExpenses: "2000", monthlyInvestment: "500", annualReturn: "7", inflation: "3", currentAge: "30", currentPortfolio: "0" },
    response: `{ "fireTarget": 600000, "realReturnPct": 4, "yearsToFire": 41, "retirementAge": 71, "retirementYear": 2067 }
// se annualReturn ≤ inflation: { "yearsToFire": null, "note": "…" }` },
  { id: "chat", method: "POST", path: "/api/v1/chat", desc: "Pergunta à IA sobre o teu portefólio ({ message }, máx. 1000 chars). Máx. 50/dia por conta.", descKey: "dev_ep_chat", auth: true,
    body: { message: "Como está diversificado o meu portefólio?" },
    response: `{ "reply": "O teu portefólio está concentrado em… (análise). Não é conselho de compra/venda." }`,
    errors: ["400 missing_message", "405 (GET)", "429 chat_limit (50/dia)", "503 ai_unavailable"] },
];

export type McpTool = { name: string; key: TranslationKey; arg?: string };

export const MCP_TOOLS: McpTool[] = [
  { name: "get_portfolio", key: "dev_tool_portfolio" },
  { name: "get_wallets", key: "dev_tool_wallets" },
  { name: "get_whale_activity", key: "dev_tool_whales", arg: "watchlist" },
  { name: "get_market", key: "dev_tool_market", arg: "limit" },
  { name: "list_known_whales", key: "dev_tool_known_whales" },
  { name: "get_asset", key: "dev_tool_asset", arg: "symbol" },
  { name: "get_fear_greed", key: "dev_tool_fear_greed" },
  { name: "get_news", key: "dev_tool_news", arg: "limit" },
  { name: "get_btc_blocks", key: "dev_tool_btc_blocks" },
  { name: "get_fire", key: "dev_tool_fire" },
  { name: "ask_ai", key: "dev_tool_ask_ai", arg: "question" },
];

export const API_LIMITS = { perMinute: 60, chatPerDay: 50, maxKeys: 5 } as const;
