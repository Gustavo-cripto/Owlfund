import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { checkApiKey } from "@/lib/api/auth";
import { getPortfolio, getWallets } from "@/lib/api/data";
import { scanWatchlist, type WatchEntry } from "@/lib/api/whales";
import { getMarket } from "@/lib/api/market";
import { getKnownWhales } from "@/lib/api/known-whales";

export const runtime = "nodejs";
export const maxDuration = 60;

// Servidor MCP (Model Context Protocol) — expõe os dados ChainFolioAI a
// agentes de IA (Claude, Cursor, …). Streamable HTTP em /api/mcp.
// Autenticado pela mesma chave `cfa_live_…` da API REST.
const handler = createMcpHandler(
  (server) => {
    server.tool(
      "get_portfolio",
      "Devolve o último snapshot do portefólio do utilizador: saldos por rede (ETH, SOL, BTC, ADA), CEX, DeFi e ativos manuais.",
      {},
      async (_args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
        const data = await getPortfolio(userId);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.tool(
      "get_wallets",
      "Devolve as carteiras e endereços ligados à conta do utilizador.",
      {},
      async (_args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
        const data = await getWallets(userId);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.tool(
      "get_whale_activity",
      "Varre os endereços dados e devolve os movimentos on-chain recentes (transferências grandes, acumulação). Suporta ETH e BTC.",
      {
        watchlist: z
          .array(z.object({
            address: z.string(),
            chain: z.enum(["eth", "btc", "sol"]),
            label: z.string().optional(),
          }))
          .max(10)
          .describe("Endereços a vigiar (máx. 10)."),
      },
      async (args, extra) => {
        const userId = (extra?.authInfo?.extra?.userId as string | undefined) ?? "";
        if (!userId) return { content: [{ type: "text", text: "Não autenticado." }], isError: true };
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
      "Devolve os principais criptoativos por capitalização de mercado (preço, market cap, volume, variação 24h e 7d).",
      {
        limit: z.number().int().min(1).max(250).optional().describe("Quantos ativos devolver (1–250, por omissão 50)."),
      },
      async (args) => {
        const data = await getMarket(args.limit ?? 50);
        return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
      },
    );

    server.tool(
      "list_known_whales",
      "Lista as baleias conhecidas pré-carregadas (exchanges, fundos, figuras públicas, governos) com endereço e cadeia. Usa os endereços como input do get_whale_activity.",
      {},
      async () => {
        const whales = getKnownWhales();
        return { content: [{ type: "text", text: JSON.stringify({ whales, count: whales.length }, null, 2) }] };
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
async function verifyToken(_req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;
  const check = await checkApiKey(bearerToken);
  if (!check.ok) return undefined;
  return {
    token: bearerToken,
    clientId: check.userId,
    scopes: ["read"],
    extra: { userId: check.userId },
  };
}

const authHandler = withMcpAuth(handler, verifyToken, { required: true });

export { authHandler as GET, authHandler as POST };
