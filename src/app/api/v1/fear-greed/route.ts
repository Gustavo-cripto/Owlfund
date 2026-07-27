import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getFearGreed } from "@/lib/api/investing";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/fear-greed — índice Fear & Greed (agora + histórico recente).
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;
  return apiJson(await getFearGreed());
}
