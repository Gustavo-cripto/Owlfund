import { getGlobalMarket } from "@/lib/api/market";
import { apiJson } from "@/lib/api/response";
import { rateLimitPublic } from "@/lib/api/requireUser";

export const runtime = "nodejs";
export const revalidate = 300;

// GET /api/v1/global — capitalização total e dominância BTC/ETH. Público.
export async function GET(req: Request) {
  const limitado = rateLimitPublic(req, "global", 60);
  if (limitado) return limitado;

  return apiJson(await getGlobalMarket());
}
