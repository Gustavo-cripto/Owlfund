import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
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
      return NextResponse.json({ balance });
    } catch {
      continue;
    }
  }

  return NextResponse.json({ error: "Failed to fetch BTC balance" }, { status: 502 });
}
