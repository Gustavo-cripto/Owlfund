import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getAsset } from "@/lib/api/investing";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/price?symbol=btc — preço e variação de um criptoativo.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const symbol = req.nextUrl.searchParams.get("symbol") ?? "";
  if (!symbol) return apiJson({ error: "missing_symbol", message: "Passa ?symbol=btc (ou eth, sol, …)." }, { status: 400 });

  const asset = await getAsset(symbol);
  if (!asset) return apiJson({ error: "not_found", message: `Ativo não encontrado: ${symbol}` }, { status: 404 });
  return apiJson(asset);
}
