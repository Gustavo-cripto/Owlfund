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
  { id: "pnl", method: "GET", path: "/api/v1/pnl", desc: "Evolução do portefólio em euros: total atual e variação a 24 h, 7 d, 30 d e desde o início.", descKey: "dev_ep_pnl", auth: true,
    response: `{
  "currency": "EUR",
  "totalEur": 12450.32,
  "updatedAt": "2026-09-18T06:00:00Z",
  "changes": [
    { "period": "24h", "eur": 120.5, "pct": 0.98, "fromAt": "2026-09-17T06:00:00Z" },
    { "period": "7d", "eur": -310.2, "pct": -2.43, "fromAt": "2026-09-11T06:00:00Z" },
    { "period": "30d", "eur": 890.1, "pct": 7.7, "fromAt": "2026-08-19T06:00:00Z" },
    { "period": "all", "eur": 2450.32, "pct": 24.5, "fromAt": "2026-03-02T06:00:00Z" }
  ],
  "snapshotsUsed": 128
}` },
  { id: "realized-gains", method: "GET", path: "/api/v1/realized-gains", desc: "Mais-valias realizadas (FIFO) em euros, com taxas e gás deduzidos: total, por ativo e por ano.", descKey: "dev_ep_realized_gains", auth: true,
    query: { year: "2026" },
    response: `{
  "currency": "EUR",
  "method": "FIFO",
  "year": 2026,
  "realizedPnlEur": 1840.55,
  "feesEur": 62.3,
  "byAsset": [{ "asset": "BTC", "realizedPnlEur": 1500.2, "feesEur": 40.1, "quantityOpen": 0.35 }],
  "byYear": [{ "year": 2026, "realizedPnlEur": 1840.55, "sales": 12 }],
  "unmatched": {}
}` },
  { id: "metrics", method: "GET", path: "/api/v1/metrics", desc: "Métricas do portefólio a partir do histórico: ROI, CAGR, Sharpe, Sortino, Calmar, volatilidade, quedas e VaR 95%.", descKey: "dev_ep_metrics", auth: true,
    response: `{
  "currency": "EUR",
  "metrics": { "days": 210, "roi": 34.2, "cagr": 61.4, "sharpe": 1.12, "maxDrawdown": -22.6, "volatility": 48.1, "var95": -4.8 }
}` },
  { id: "trades", method: "GET", path: "/api/v1/trades", desc: "Transações registadas (compras, vendas e taxas), da mais recente para a mais antiga.", descKey: "dev_ep_trades", auth: true,
    query: { asset: "BTC", year: "2026", limit: "100" },
    response: `{
  "total": 84,
  "returned": 100,
  "trades": [{ "date": "2026-06-10", "type": "venda", "asset": "BTC", "quantity": 0.25, "priceEur": 58000, "totalEur": 14500, "feeEur": 12.4 }]
}` },
  { id: "tax-estimate", method: "GET", path: "/api/v1/tax-estimate", desc: "ESTIMATIVA de imposto sobre mais-valias num país, na moeda desse país (FIFO, câmbio do BCE à data de cada operação). Não é uma declaração.", descKey: "dev_ep_tax_estimate", auth: true,
    query: { country: "PT", year: "2026" },
    response: `{
  "country": "PT",
  "currency": "EUR",
  "rates": { "short": 0.28, "long": 0, "longTermAfterDays": 365 },
  "sales": 12,
  "totalGain": 4200.5,
  "taxableGain": 3100.0,
  "exemptGain": 1100.5,
  "estimatedTax": 868.0
}` },
  { id: "tax-countries", method: "GET", path: "/api/v1/tax-countries", desc: "Regimes fiscais publicados (taxas, prazo de longo prazo, isenção anual e lei) por país. Público, sem chave.", descKey: "dev_ep_tax_countries", auth: false,
    response: `{
  "total": 21,
  "countries": [{ "code": "PT", "currency": "EUR", "shortTermRate": 0.28, "longTermRate": 0, "longTermAfterDays": 365, "law": "Lei n.º 24-D/2022, art. 5.º" }]
}` },
  { id: "global", method: "GET", path: "/api/v1/global", desc: "Capitalização total do mercado cripto, variação 24 h e dominância BTC/ETH. Público, sem chave.", descKey: "dev_ep_global", auth: false,
    response: `{ "totalMarketCapUsd": 2.31e12, "marketCapChange24h": -1.4, "btcDominance": 58.2, "ethDominance": 11.7 }` },
  { id: "derivatives", method: "GET", path: "/api/v1/derivatives", desc: "Derivados de um símbolo na OKX: open interest, long/short, funding, CVD, taker, velas, put/call e score de sentimento.", descKey: "dev_ep_derivatives", auth: true, query: { symbol: "BTC" },
    response: `{ "symbol": "BTC", "score": 54, "rsi": 48.2, "components": { "longShort": 51, "taker": 49, "rsi": 48, "cvd": 65, "funding": 55, "putCall": 57 } }` },
  { id: "price-on", method: "GET", path: "/api/v1/price-on", desc: "Preço de fecho em dólares de um ativo numa data (UTC). Útil para avaliar uma operação passada.", descKey: "dev_ep_price_on", auth: true, query: { symbol: "BTC", date: "2026-01-15" },
    response: `{ "symbol": "BTC", "date": "2026-01-15", "usd": 61234.5 }` },
  { id: "defi", method: "GET", path: "/api/v1/defi", desc: "Posições de lending lidas dos contratos (Aave V3, Spark, Compound V3, Morpho, EigenLayer): depositado, emprestado e líquido.", descKey: "dev_ep_defi", auth: true,
    response: `{
  "currency": "USD",
  "totalNetUsd": 4120.5,
  "totalSuppliedUsd": 9800.0,
  "totalBorrowedUsd": 5679.5,
  "wallets": [{ "label": "Ledger", "netUsd": 4120.5,
    "positions": [{ "protocol": "aave-v3", "chain": "eth", "suppliedUsd": 9800, "borrowedUsd": 5679.5, "netUsd": 4120.5, "healthFactor": 1.72 }] }],
  "walletsRead": 2, "walletsSkipped": 0
}` },
  { id: "nfts", method: "GET", path: "/api/v1/nfts", desc: "NFTs das carteiras EVM numa rede (?chain=eth). Não entram no total do portefólio.", descKey: "dev_ep_nfts", auth: true, query: { chain: "eth" },
    response: `{ "chain": "eth", "totalNfts": 12, "wallets": [{ "label": "Principal", "total": 12, "returned": 12, "nfts": [{ "name": "…", "collection": "0x…", "tokenId": "1" }] }] }` },
  { id: "score", method: "GET", path: "/api/v1/score", desc: "Pontuação 0–100 do portefólio, tal como aparece na app (diversificação, mistura, reserva estável, desempenho, risco).", descKey: "dev_ep_score", auth: true,
    response: `{ "score": 72, "max": 100, "asOf": "2026-09-18T06:00:00Z",
  "parts": [{ "id": "diversification", "label": "Diversificação", "points": 22, "max": 30 }] }` },
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
  { name: "get_pnl", key: "dev_tool_pnl" },
  { name: "get_realized_gains", key: "dev_tool_realized_gains", arg: "year" },
  { name: "get_metrics", key: "dev_tool_metrics" },
  { name: "get_trades", key: "dev_tool_trades", arg: "asset" },
  { name: "get_tax_estimate", key: "dev_tool_tax_estimate", arg: "country" },
  { name: "list_tax_countries", key: "dev_tool_tax_countries" },
  { name: "get_global_market", key: "dev_tool_global" },
  { name: "get_derivatives", key: "dev_tool_derivatives", arg: "symbol" },
  { name: "get_price_on", key: "dev_tool_price_on", arg: "date" },
  { name: "get_defi_positions", key: "dev_tool_defi" },
  { name: "get_nfts", key: "dev_tool_nfts", arg: "chain" },
  { name: "get_portfolio_score", key: "dev_tool_score" },
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
