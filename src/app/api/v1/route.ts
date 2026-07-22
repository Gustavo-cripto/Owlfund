import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Índice de descoberta da API pública (sem autenticação).
export async function GET() {
  return NextResponse.json({
    name: "ChainFolioAI API",
    version: "v1",
    documentation: "https://owlfund.vercel.app/account",
    authentication:
      "Bearer token — cabeçalho 'Authorization: Bearer owf_live_…'. Gera chaves em Conta → API & MCP (plano Premium).",
    endpoints: [
      { method: "GET", path: "/api/v1", description: "Este índice." },
      { method: "GET", path: "/api/v1/portfolio", description: "Último snapshot do portefólio: saldos por rede, CEX, DeFi e ativos manuais." },
      { method: "GET", path: "/api/v1/wallets", description: "Carteiras e endereços ligados à tua conta." },
    ],
  });
}
