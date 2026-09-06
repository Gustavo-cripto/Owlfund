import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api/auth";
import { computeFire } from "@/lib/api/investing";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({
  monthlyExpenses: z.coerce.number().min(0).max(1e7).default(2000),
  monthlyInvestment: z.coerce.number().min(0).max(1e7).default(500),
  annualReturn: z.coerce.number().min(-50).max(100).default(7),
  inflation: z.coerce.number().min(-20).max(100).default(3),
  currentAge: z.coerce.number().int().min(0).max(120).default(30),
  currentPortfolio: z.coerce.number().min(0).max(1e11).default(0),
});

// GET /api/v1/fire?monthlyExpenses=&monthlyInvestment=&annualReturn=&inflation=&currentAge=&currentPortfolio=
// Calcula os anos até à independência financeira (regra dos 4%).
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const p = req.nextUrl.searchParams;
  const raw = Object.fromEntries(["monthlyExpenses", "monthlyInvestment", "annualReturn", "inflation", "currentAge", "currentPortfolio"].map(k => [k, p.get(k) ?? undefined]));
  const parsed = Query.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return apiJson({ error: "invalid_param", message: `${issue.path.join(".")}: ${issue.message}` }, { status: 400 });
  }
  return apiJson(computeFire(parsed.data));
}
