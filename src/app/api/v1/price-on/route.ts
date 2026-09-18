import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getPriceOn } from "@/lib/api/market";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const revalidate = 86400;

// GET /api/v1/price-on?symbol=BTC&date=2026-01-15 — preço de fecho nesse dia (UTC).
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const p = req.nextUrl.searchParams;
  const date = p.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date_required", message: "Indica a data em AAAA-MM-DD, ex.: ?date=2026-01-15" }, { status: 400 });
  }

  return apiJson(await getPriceOn(p.get("symbol") ?? "", date));
}
