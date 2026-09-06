import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api/auth";
import { getNews } from "@/lib/api/investing";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Query = z.object({ limit: z.coerce.number().int().min(1).max(30).default(15) });

// GET /api/v1/news?limit=N — últimas notícias de cripto (CoinDesk, CoinTelegraph).
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const parsed = Query.safeParse({ limit: req.nextUrl.searchParams.get("limit") ?? undefined });
  if (!parsed.success) return apiJson({ error: "invalid_param", message: "limit tem de ser um inteiro entre 1 e 30." }, { status: 400 });
  const items = await getNews(parsed.data.limit);
  return apiJson({ news: items, count: items.length });
}
