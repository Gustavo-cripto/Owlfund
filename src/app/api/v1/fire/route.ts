import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { computeFire } from "@/lib/api/investing";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: string | null, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

// GET /api/v1/fire?monthlyExpenses=&monthlyInvestment=&annualReturn=&inflation=&currentAge=&currentPortfolio=
// Calcula os anos até à independência financeira (regra dos 4%).
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const p = req.nextUrl.searchParams;
  const result = computeFire({
    monthlyExpenses: num(p.get("monthlyExpenses"), 2000),
    monthlyInvestment: num(p.get("monthlyInvestment"), 500),
    annualReturn: num(p.get("annualReturn"), 7),
    inflation: num(p.get("inflation"), 3),
    currentAge: num(p.get("currentAge"), 30),
    currentPortfolio: num(p.get("currentPortfolio"), 0),
  });
  return apiJson(result);
}
