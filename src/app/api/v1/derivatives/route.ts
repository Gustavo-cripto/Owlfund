import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getDerivatives } from "@/lib/api/derivatives";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const revalidate = 120;

// GET /api/v1/derivatives?symbol=BTC — OI, long/short, funding, CVD, taker, put/call e score.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "BTC")
    .toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);

  return apiJson(await getDerivatives(symbol));
}
