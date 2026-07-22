import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { getWallets } from "@/lib/api/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/wallets — carteiras e endereços ligados à conta do dono da chave.
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  return NextResponse.json(await getWallets(auth.userId));
}
