import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { checkApiKey } from "@/lib/api/auth";
import { getPortfolio, getWallets } from "@/lib/api/data";

export const runtime = "nodejs";
export const maxDuration = 60;

// Servidor MCP (Model Context Protocol) — expõe os dados ChainFolioAI a
// agentes de IA (Claude, Cursor, …). Streamable HTTP em /api/mcp.
// Autenticado pela mesma chave `owf_live_…` da API REST.
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
