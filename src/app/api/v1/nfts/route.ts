import { NextRequest } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getNfts } from "@/lib/api/onchain";
import { apiJson } from "@/lib/api/response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/v1/nfts?chain=eth — NFTs das carteiras EVM do dono da chave.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  return apiJson(await getNfts(auth.userId, req.nextUrl.searchParams.get("chain") ?? undefined));
}
