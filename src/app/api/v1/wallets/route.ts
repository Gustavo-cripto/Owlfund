import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getWallets } from "@/lib/api/data";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/wallets — carteiras e endereços ligados à conta do dono da chave.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  return apiJson(await getWallets(auth.userId));
}
