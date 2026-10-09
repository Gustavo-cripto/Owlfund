import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getMetrics } from "@/lib/api/insights";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/metrics — ROI, CAGR, Sharpe, volatilidade, drawdown, VaR do dono da chave.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  try {
    return apiJson(await getMetrics(auth.userId));
  } catch (e) {
    // A leitura das fotografias falhou: 503 em JSON, em vez de números vazios.
    console.error("[v1/metrics]", e instanceof Error ? e.message : e);
    return apiJson({ error: "service_unavailable", code: "service_unavailable", message: "Snapshots are temporarily unavailable. Try again shortly." }, { status: 503 });
  }
}
