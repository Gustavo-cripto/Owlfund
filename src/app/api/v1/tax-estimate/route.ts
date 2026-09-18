import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getTaxEstimate } from "@/lib/api/insights";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/tax-estimate?country=PT&year=2026 — estimativa de imposto (não é uma declaração).
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const p = req.nextUrl.searchParams;
  const country = (p.get("country") ?? "").trim();
  if (!/^[A-Za-z]{2}$/.test(country)) {
    return NextResponse.json({ error: "country_required", message: "Indica o país em duas letras, ex.: ?country=PT" }, { status: 400 });
  }
  const year = /^\d{4}$/.test(p.get("year") ?? "") ? Number(p.get("year")) : undefined;

  return apiJson(await getTaxEstimate(auth.userId, country, year));
}
