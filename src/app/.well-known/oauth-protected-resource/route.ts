import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Metadados RFC 9728 anunciados pelo mcp-handler no WWW-Authenticate. Não há
// servidor OAuth: a autenticação é por chave estática (Bearer cfa_live_…), por
// isso só indicamos o recurso e onde obter a chave.
export async function GET() {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";
  return NextResponse.json({
    resource: `${base}/api/mcp`,
    bearer_methods_supported: ["header"],
    resource_documentation: `${base}/developers`,
    resource_name: "ChainFolioAI MCP",
  }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
