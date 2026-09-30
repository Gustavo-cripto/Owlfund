import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getTaxEstimate } from "@/lib/api/insights";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/tax-estimate?country=PT&year=2026[&alternative=true][&marginalRate=0.35] — estimativa de imposto (não é uma declaração).
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const p = req.nextUrl.searchParams;
  const country = (p.get("country") ?? "").trim();
  if (!/^[A-Za-z]{2}$/.test(country)) {
    return NextResponse.json({ error: "country_required", message: "Indica o país em duas letras, ex.: ?country=PT" }, { status: 400 });
  }
  const year = /^\d{4}$/.test(p.get("year") ?? "") ? Number(p.get("year")) : undefined;
  // Escolhas que a página deixa fazer: ?alternative=true (BR, PT, AR, AT) e
  // ?marginalRate=0.35 (&marginalRateLong=0.15 nos EUA) onde a taxa depende do rendimento.
  const alternative = ["1", "true", "yes"].includes((p.get("alternative") ?? "").toLowerCase());
  const taxa = (k: string) => { const v = p.get(k); return v == null || v.trim() === "" ? undefined : Number(v.replace(",", ".")); };
  const r = await getTaxEstimate(auth.userId, country, year, { alternative, marginalRate: taxa("marginalRate"), marginalRateLong: taxa("marginalRateLong") });
  return apiJson(r, "error" in r ? { status: 400 } : undefined);
}
