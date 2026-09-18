import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getTrades } from "@/lib/api/insights";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/trades?asset=BTC&year=2026&limit=100 — transações do dono da chave.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const p = req.nextUrl.searchParams;
  const year = /^\d{4}$/.test(p.get("year") ?? "") ? Number(p.get("year")) : undefined;
  const limit = /^\d{1,3}$/.test(p.get("limit") ?? "") ? Number(p.get("limit")) : undefined;

  return apiJson(await getTrades(auth.userId, { asset: p.get("asset") ?? undefined, year, limit }));
}
