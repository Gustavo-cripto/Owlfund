import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getBtcBlocks } from "@/lib/api/investing";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/btc-blocks — blocos Bitcoin recentes (mempool) + taxas recomendadas.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  return apiJson(await getBtcBlocks());
}
