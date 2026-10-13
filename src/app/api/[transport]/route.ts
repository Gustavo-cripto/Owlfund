import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { checkApiKey } from "@/lib/api/auth";
import { getPortfolio, getWallets } from "@/lib/api/data";
import { getMetrics, getPnl, getRealizedGains, getScore, getTaxEstimate, getTrades, listTaxCountries } from "@/lib/api/insights";
import { scanWatchlist, type WatchEntry } from "@/lib/api/whales";
import { getGlobalMarket, getMarket, getPriceOn } from "@/lib/api/market";
import { getDerivatives } from "@/lib/api/derivatives";
import { getDefiPositions, getNfts } from "@/lib/api/onchain";
import { getKnownWhales } from "@/lib/api/known-whales";
import { getFearGreed, getAsset, computeFire, getNews, getBtcBlocks } from "@/lib/api/investing";
import { responderPortefolio } from "@/lib/api/ai";

const ADDRESS_RE = /^(0x[a-fA-F0-9]{40}|(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}|[1-9A-HJ-NP-Za-km-z]{32,44})$/;

export const runtime = "nodejs";
export const maxDuration = 60;

// Servidor MCP (Model Context Protocol) — expõe os dados ChainFolioAI a
// agentes de IA (Claude, Cursor, …). Streamable HTTP em /api/mcp.
// Autenticado pela mesma chave `cfa_live_…` da API REST.
const handler = createMcpHandler(
  (server) => {
    // Todas as tools passam por um wrapper: uma fonte externa em baixo devolve
    // texto útil ao LLM (isError) em vez de um erro JSON-RPC opaco.
    const rawTool = server.tool.bind(server);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (server as any).tool = (name: string, desc: string, schema: unknown, cb: (...a: any[]) => Promise<unknown>) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (rawTool as any)(name, desc, schema, async (...a: any[]) => {
        try { return await cb(...a); }
        catch (e) {
          // O detalhe (Postgres, URLs de RPC…) fica só no log do servidor,
          // como em src/lib/api/response.ts (internalError) — nunca no cliente.
          console.error(`[mcp:${name}]`, e instanceof Error ? e.message : String(e));
          return { content: [{ type: "text", text: `Temporary failure in ${name}. Try again shortly.` }], isError: true };
        }
      });

    server.tool(
      "get_portfolio",
      "Returns the user's latest portfolio snapshot: balances per network (ETH, SOL, BTC, ADA), exchanges (CEX), DeFi and manual assets.",
      {},
      async (_args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
        const data = await getPortfolio(userId);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.tool(
      "get_wallets",
      "Returns the wallets of each portfolio, with addresses as pseudonyms (wallet_…), never in clear.",
      {},
      async (_args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
        const data = await getWallets(userId);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.tool(
      "get_pnl",
      "The user's portfolio performance in euros: current total and change over 24 h, 7 days, 30 days and since the start, from the saved snapshots.",
      {},
      async (_args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
        const data = await getPnl(userId);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.tool(
      "get_realized_gains",
      "The user's realised capital gains using FIFO, in euros, with fees and gas deducted: total, per asset and per year. Not a tax return.",
      { year: z.number().int().min(2009).max(2100).optional().describe("Calendar year of the sales (optional; without it everything is returned).") },
      async (args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
        const data = await getRealizedGains(userId, args.year);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.tool(
      "get_metrics",
      "Advanced portfolio metrics from the saved history: ROI, CAGR, Sharpe, Sortino, Calmar, volatility, maximum and current drawdown, win rate and 95% VaR.",
      {},
      async (_args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(await getMetrics(userId), null, 2) }] };
      },
    );

    server.tool(
      "get_trades",
      "Transactions recorded by the user (buys, sells and fees), in euros, newest first. Optional filters by asset and year.",
      {
        asset: z.string().max(20).optional().describe("Asset symbol (e.g. BTC)."),
        year: z.number().int().min(2009).max(2100).optional().describe("Calendar year of the transaction."),
        limit: z.number().int().min(1).max(500).optional().describe("Maximum number of transactions to return (default 100)."),
      },
      async (args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(await getTrades(userId, args), null, 2) }] };
      },
    );

    server.tool(
      "get_tax_estimate",
      "ESTIMATE of capital-gains tax in a country, in that country's currency: the country's cost method (FIFO, average cost, LIFO, UK pooling, annual sum), each trade converted at the ECB rate of its date, the rules of the year of sale, holding period, annual allowance and, where the law allows, losses carried from previous years. Not a tax return. Each country's options are in list_tax_countries (options field).",
      {
        country: z.string().length(2).describe("Two-letter country code (e.g. PT, ES, US). See list_tax_countries."),
        year: z.number().int().min(2009).max(2100).optional().describe("Tax year of the sales (optional). In the UK and Australia it is the year the tax year starts (2025 = 2025/26)."),
        alternative: z.boolean().optional().describe("BR, PT, AR and AT only: the alternative option for where the coins are held (BR foreign exchange; PT broker outside the EU/EEA with no tax treaty; AR sale in pesos; AT Austrian platform)."),
        marginalRate: z.number().min(0).max(0.6).optional().describe("Only where the rate depends on income (DE, GB, US, CA, AU, LU, MX): the person's marginal rate as a fraction (0.35 = 35%). Without it the top rate is used."),
        marginalRateLong: z.number().min(0).max(0.6).optional().describe("US only: the person's long-term rate as a fraction (0, 0.15 or 0.20, plus 0.038 NIIT if applicable)."),
      },
      async (args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(await getTaxEstimate(userId, args.country, args.year, { alternative: args.alternative, marginalRate: args.marginalRate, marginalRateLong: args.marginalRateLong }), null, 2) }] };
      },
    );

    server.tool(
      "list_tax_countries",
      "Crypto tax regimes published by ChainFolioAI: short- and long-term rate, holding period, annual allowance and legal reference, per country.",
      {},
      async () => ({ content: [{ type: "text", text: JSON.stringify(listTaxCountries(), null, 2) }] }),
    );

    server.tool(
      "get_global_market",
      "Global crypto market state: total market cap, 24 h change and Bitcoin and Ethereum dominance.",
      {},
      async () => ({ content: [{ type: "text", text: JSON.stringify(await getGlobalMarket(), null, 2) }] }),
    );

    server.tool(
      "get_derivatives",
      "Derivatives data for a symbol on OKX: open interest, long/short ratio, funding, CVD, taker volume, 1 h candles, put/call and a composite sentiment score (0–100).",
      { symbol: z.string().max(10).optional().describe("Symbol, e.g. BTC (default) or ETH.") },
      async (args) => {
        const symbol = (args.symbol ?? "BTC").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
        return { content: [{ type: "text", text: JSON.stringify(await getDerivatives(symbol), null, 2) }] };
      },
    );

    server.tool(
      "get_price_on",
      "Closing price in US dollars of a crypto asset on a date (UTC), from OKX daily candles. Useful to value a past buy or sale.",
      {
        symbol: z.string().max(10).describe("Symbol, e.g. BTC."),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Data em AAAA-MM-DD (UTC)."),
      },
      async (args) => ({ content: [{ type: "text", text: JSON.stringify(await getPriceOn(args.symbol, args.date), null, 2) }] }),
    );

    server.tool(
      "get_defi_positions",
      "The user's lending positions read from the contracts (Aave V3, Spark, Compound V3, Morpho, EigenLayer) on Ethereum, Arbitrum, Base, Optimism and Polygon: supplied, borrowed and net, with health factor. It queries the blockchain, so it takes a few seconds.",
      {},
      async (_args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(await getDefiPositions(userId), null, 2) }] };
      },
    );

    server.tool(
      "get_nfts",
      "NFTs in the user's EVM wallets on one network. They are not included in the portfolio total (no reliable price).",
      { chain: z.enum(["eth", "polygon", "arbitrum", "base", "optimism"]).optional().describe("Network (default eth).") },
      async (args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(await getNfts(userId, args.chain), null, 2) }] };
      },
    );

    server.tool(
      "get_portfolio_score",
      "The user's portfolio score (0–100), as shown in the app: diversification, crypto/traditional mix, stablecoin reserve, performance and risk management. A reading aid, not a recommendation to buy or sell.",
      {},
      async (_args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
        return { content: [{ type: "text", text: JSON.stringify(await getScore(userId), null, 2) }] };
      },
    );

    server.tool(
      "get_whale_activity",
      "Scans the given addresses and returns recent on-chain movements (large transfers, accumulation). Supports ETH, BTC and SOL.",
      {
        watchlist: z
          .array(z.object({
            address: z.string().regex(ADDRESS_RE, "Invalid address (ETH 0x…, BTC or SOL)"),
            chain: z.enum(["eth", "btc", "sol"]),
            label: z.string().max(60).optional(),
          }))
          .max(10)
          .describe("Addresses to watch (max. 10)."),
      },
      async (args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
        const watchlist: WatchEntry[] = (args.watchlist ?? []).map((w) => ({
          address: w.address,
          chain: w.chain,
          label: w.label ?? "",
        }));
        const data = await scanWatchlist(watchlist);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.tool(
      "get_market",
      "Returns the top crypto assets by market cap (price, market cap, volume, 24h and 7d change).",
      {
        limit: z.number().int().min(1).max(250).optional().describe("How many assets to return (1–250, default 50)."),
      },
      async (args) => {
        const data = await getMarket(args.limit ?? 50);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.tool(
      "list_known_whales",
      "Lists the preloaded known whales (exchanges, funds, public figures, governments) with address and chain. Use the addresses as input to get_whale_activity.",
      {},
      async () => {
        const whales = getKnownWhales();
        return { content: [{ type: "text", text: JSON.stringify({ whales, count: whales.length }, null, 2) }] };
      },
    );

    server.tool(
      "get_fear_greed",
      "Crypto market Fear & Greed index (current value 0–100, classification and recent history).",
      {},
      async () => {
        const data = await getFearGreed();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.tool(
      "get_asset",
      "Price, market cap, volume and change (24h/7d) of a crypto asset by symbol (e.g. btc, eth, sol).",
      { symbol: z.string().regex(/^[a-zA-Z0-9]{1,20}$/).describe("Asset symbol, e.g. btc") },
      async (args) => {
        const asset = await getAsset(args.symbol);
        return { content: [{ type: "text", text: asset ? JSON.stringify(asset, null, 2) : `Ativo não encontrado: ${args.symbol}` }], isError: !asset };
      },
    );

    server.tool(
      "get_fire",
      "Calculates the years to financial independence (4% rule) from expenses, savings, return and age.",
      {
        monthlyExpenses: z.number().min(0).max(1e7).describe("Monthly expenses"),
        monthlyInvestment: z.number().min(0).max(1e7).describe("Monthly savings/investment"),
        annualReturn: z.number().min(-50).max(100).optional().describe("Expected annual return in % (default 7)"),
        inflation: z.number().min(-20).max(100).optional().describe("Annual inflation in % (default 3)"),
        currentAge: z.number().int().min(0).max(120).optional().describe("Current age (default 30)"),
        currentPortfolio: z.number().min(0).max(1e11).optional().describe("Current net worth (default 0)"),
      },
      async (args) => {
        const result = computeFire({
          monthlyExpenses: args.monthlyExpenses,
          monthlyInvestment: args.monthlyInvestment,
          annualReturn: args.annualReturn ?? 7,
          inflation: args.inflation ?? 3,
          currentAge: args.currentAge ?? 30,
          currentPortfolio: args.currentPortfolio ?? 0,
        });
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      },
    );

    server.tool(
      "get_news",
      "Latest crypto news (CoinDesk, CoinTelegraph): title, source, link and date.",
      { limit: z.number().int().min(1).max(30).optional().describe("How many news items (default 15)") },
      async (args) => {
        const news = await getNews(args.limit ?? 15);
        return { content: [{ type: "text", text: JSON.stringify({ news, count: news.length }, null, 2) }] };
      },
    );

    server.tool(
      "get_btc_blocks",
      "Recent Bitcoin blocks (height, number of transactions, median fee, pool) and recommended mempool fees.",
      {},
      async () => {
        const data = await getBtcBlocks();
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.tool(
      "ask_ai",
      "Ask the AI assistant, in natural language, about your real portfolio (analysis, context, risks). It never gives buy or sell orders. Daily limit per account.",
      { question: z.string().max(1000).describe("The question about the portfolio or the market (max. 1000 characters).") },
      async (args, extra) => {
        const inicio = Date.now();
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Not authenticated." }], isError: true };
        const question = (args.question ?? "").trim().slice(0, 1000);
        if (!question) return { content: [{ type: "text", text: "Empty question." }], isError: true };

        // A mesma função do /api/v1/chat: teto diário partilhado, PNL do mesmo
        // portefólio, mercado ao vivo e o prompt único (src/lib/api/ai.ts).
        const r = await responderPortefolio(userId, question, { prazo: inicio + 48_000 });
        if (r.ok) return { content: [{ type: "text", text: r.reply }] };
        return { content: [{ type: "text", text: r.message }], isError: true };
      },
    );
  },
  {
    serverInfo: { name: "ChainFolioAI", version: "1.0.0" },
  },
  {
    basePath: "/api",
    disableSse: true,
  },
);

// Valida o Bearer token (mesma chave da API REST) antes de servir o MCP.
// Também aceita a chave no cabeçalho `x-api-key`: gateways como o Smithery
// reservam o `Authorization` para si e não o deixam passar até nós.
async function verifyToken(req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  // Há quem cole "Bearer cfa_live_…" no campo da chave: tira-se o prefixo.
  const doCabecalho = req.headers.get("x-api-key")?.trim().replace(/^bearer\s+/i, "") || undefined;
  const chave = bearerToken || doCabecalho;
  if (!chave) {
    // Diagnóstico sem a chave: só o que veio (para perceber gateways como o Smithery).
    console.warn("[mcp] sem chave", { authorization: req.headers.has("authorization"), xApiKey: req.headers.has("x-api-key"), ua: (req.headers.get("user-agent") ?? "").slice(0, 40) });
    return undefined;
  }
  const check = await checkApiKey(chave);
  if (!check.ok) {
    console.warn("[mcp] chave recusada", { motivo: check.reason, via: bearerToken ? "authorization" : "x-api-key", formato: /^(cfa|owf)_live_/i.test(chave) ? "prefixo-ok" : "prefixo-errado", tamanho: chave.length });
    return undefined;
  }
  return {
    token: chave,
    clientId: check.userId,
    scopes: ["read"],
    extra: { userId: check.userId },
  };
}

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

// Descoberta sem chave: apresentar o servidor e listar as ferramentas é público
// (a mesma informação está em /developers). Diretórios como o Smithery testam o
// servidor SEM enviar a chave e, com um 401, concluíam que era OAuth e não o
// listavam. Chamar uma ferramenta (tools/call) continua SEMPRE a exigir chave —
// também as de mercado, que gastam fornecedores pagos.
const METODOS_PUBLICOS = new Set([
  "initialize", "notifications/initialized", "ping",
  "tools/list", "prompts/list", "resources/list", "resources/templates/list",
]);

async function mcp(req: Request): Promise<Response> {
  const temChave = req.headers.has("authorization") || req.headers.has("x-api-key");
  if (!temChave && req.method === "POST") {
    const corpo = (await req.clone().json().catch(() => null)) as unknown;
    const mensagens = Array.isArray(corpo) ? corpo : [corpo];
    const soDescoberta = mensagens.length > 0 && mensagens.every((m) => {
      const metodo = (m as { method?: unknown } | null)?.method;
      return typeof metodo === "string" && METODOS_PUBLICOS.has(metodo);
    });
    if (soDescoberta) return handler(req);
  }
  return authHandler(req);
}

export { mcp as GET, mcp as POST };
