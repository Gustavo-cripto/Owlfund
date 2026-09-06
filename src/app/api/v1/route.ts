import { apiJson } from "@/lib/api/response";
import { API_ENDPOINTS, API_LIMITS, MCP_TOOLS } from "@/lib/api/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Índice de descoberta da API pública (sem autenticação).
export async function GET() {
  return apiJson({
    name: "ChainFolioAI API",
    version: "v1",
    documentation: "https://chainfolioai.com/developers",
    authentication:
      "Bearer token — cabeçalho 'Authorization: Bearer cfa_live_…'. Gera chaves em Conta → API & MCP (plano Premium).",
    limits: { requestsPerMinute: API_LIMITS.perMinute, chatPerDay: API_LIMITS.chatPerDay, maxActiveKeys: API_LIMITS.maxKeys },
    mcp: { url: "https://chainfolioai.com/api/mcp", transport: "streamable-http", tools: MCP_TOOLS.map(t => t.name) },
    endpoints: API_ENDPOINTS.map(e => ({ method: e.method, path: e.path, auth: e.auth, description: e.desc })),
  });
}
