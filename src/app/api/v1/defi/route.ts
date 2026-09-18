import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getDefiPositions } from "@/lib/api/onchain";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;  // le contratos em 5 redes; nao cabe nos 10 s por omissao

// GET /api/v1/defi — posições de lending do dono da chave: depositado, emprestado, líquido.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  return apiJson(await getDefiPositions(auth.userId));
}
