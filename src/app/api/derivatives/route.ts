import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/requireUser";
import { getDerivatives } from "@/lib/api/derivatives";

export const revalidate = 120; // dados de derivados atualizam devagar

// GET /api/derivatives?symbol=BTC — OI, Long/Short, Funding, CVD, Taker, velas,
// Put/Call (OKX) + um score de sentimento composto 0–100.
export async function GET(req: NextRequest) {
  // Proxy com custo/quota nossa: so com sessao, e com limite por utilizador.
  const auth = await requireUser(req, { route: "derivatives", limit: 60 });
  if (!auth.ok) return auth.response;

  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "BTC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 10);

  return NextResponse.json(await getDerivatives(symbol));
}
