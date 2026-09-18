import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getRealizedGains } from "@/lib/api/insights";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/realized-gains?year=2026 — mais-valias realizadas (FIFO) do dono da chave.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const raw = req.nextUrl.searchParams.get("year");
  const year = raw && /^\d{4}$/.test(raw) ? Number(raw) : undefined;

  return apiJson(await getRealizedGains(auth.userId, year));
}
