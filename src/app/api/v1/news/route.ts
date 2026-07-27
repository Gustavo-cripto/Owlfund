import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getNews } from "@/lib/api/investing";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/news?limit=N — últimas notícias de cripto (CoinDesk, CoinTelegraph).
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const limit = Number(req.nextUrl.searchParams.get("limit") ?? "15");
  const items = await getNews(limit);
  return apiJson({ news: items, count: items.length });
}
