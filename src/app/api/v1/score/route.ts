import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getScore } from "@/lib/api/insights";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/score — pontuação do portefólio, tal como foi mostrada na app.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  return apiJson(await getScore(auth.userId));
}
