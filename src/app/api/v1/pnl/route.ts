import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getPnl } from "@/lib/api/insights";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/pnl — evolução do portefólio do dono da chave (24 h, 7 d, 30 d, tudo).
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  return apiJson(await getPnl(auth.userId));
}
