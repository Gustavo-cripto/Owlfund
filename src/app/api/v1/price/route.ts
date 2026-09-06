import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getAsset } from "@/lib/api/investing";
import { apiJson } from "@/lib/api/response";
import { upstreamResponse } from "@/lib/api/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/price?symbol=btc — preço e variação de um criptoativo.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "").trim().slice(0, 20);
  if (!symbol) return apiJson({ error: "missing_symbol", message: "Passa ?symbol=btc (ou eth, sol, …)." }, { status: 400 });
  if (!/^[a-zA-Z0-9]{1,20}$/.test(symbol)) return apiJson({ error: "invalid_param", message: "symbol só aceita letras e dígitos (máx. 20)." }, { status: 400 });

  try {
    const asset = await getAsset(symbol);
    // 404 só quando a fonte respondeu e não conhece o símbolo (429/5xx → 503).
    if (!asset) return apiJson({ error: "not_found", message: `Ativo não encontrado: ${symbol}` }, { status: 404 });
    return apiJson(asset);
  } catch (e) { return upstreamResponse(e); }
}
