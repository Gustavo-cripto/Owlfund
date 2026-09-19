import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/requireUser";
import { checkRateLimit } from "@/lib/rate-limit";
import { apiMsg } from "@/lib/api/apiMessages";
import { isValidBtcAddress } from "@/lib/wallets/btcAddress";

const CACHE_HEADERS = { "Cache-Control": "private, s-maxage=30, stale-while-revalidate=60" };

export async function GET(req: NextRequest) {
  // Proxy com custo/quota nossa: so com sessao, e com limite por utilizador.
  const auth = await requireUser(req, { route: "btc-balance", limit: 60 });
  if (!auth.ok) return auth.response;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Demasiados pedidos." }, { status: 429 });
  }

  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 });
  // Checksum antes de gastar pedidos: um endereco que nao existe nunca vai ter saldo.
  if (!isValidBtcAddress(address)) return NextResponse.json({ error: apiMsg(req, "btc_address_not_on_chain") }, { status: 400 });

  const endpoints = [
    `https://mempool.space/api/address/${address}`,
    `https://blockstream.info/api/address/${address}`,
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json() as Record<string, unknown>;
      const stats = (data?.chain_stats ?? data) as Record<string, unknown>;
      const funded = Number(stats?.funded_txo_sum ?? 0);
      const spent = Number(stats?.spent_txo_sum ?? 0);
      const balance = (funded - spent) / 1e8;
      return NextResponse.json({ balance }, { headers: CACHE_HEADERS });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: "Failed to fetch BTC balance" }, { status: 502 });
}
