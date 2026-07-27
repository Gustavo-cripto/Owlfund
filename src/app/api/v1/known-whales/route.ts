import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getKnownWhales } from "@/lib/api/known-whales";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/known-whales — baleias conhecidas pré-carregadas (exchanges,
// fundos, figuras públicas, governos). Úteis como input do /whales.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const whales = getKnownWhales();
  return apiJson({ whales, count: whales.length });
}
