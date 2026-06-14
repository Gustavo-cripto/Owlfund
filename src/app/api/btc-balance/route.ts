import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

const CACHE_HEADERS = { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" };

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: "Demasiados pedidos." }, { status: 429 });
  }

  const address = req.nextUrl.searchParams.get("address");
  if (!address) return NextResponse.json({ error: "Missing address" }, { status: 400 });

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
