import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api/auth";
import { getMarket } from "@/lib/api/market";
import { apiJson } from "@/lib/api/response";
import { upstreamResponse } from "@/lib/api/upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({ limit: z.coerce.number().int().min(1).max(250).default(50) });

// GET /api/v1/market?limit=N — top criptoativos por capitalização (1–250, def. 50).
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const parsed = Query.safeParse({ limit: req.nextUrl.searchParams.get("limit") ?? undefined });
  if (!parsed.success) return apiJson({ error: "invalid_param", message: "limit tem de ser um inteiro entre 1 e 250." }, { status: 400 });
  try {
    return apiJson(await getMarket(parsed.data.limit));
  } catch (e) { return upstreamResponse(e); }
}
