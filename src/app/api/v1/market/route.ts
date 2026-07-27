import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getMarket } from "@/lib/api/market";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/market?limit=N — top criptoativos por capitalização (1–250, def. 50).
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "50");
  return apiJson(await getMarket(limit));
}
