import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function fetchJSON(url: string) {
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// Transform blockstream.info block format → mempool.space-compatible shape
function toMempoolShape(b: Record<string, unknown>) {
  return {
    height: b.height,
    timestamp: b.timestamp,
    tx_count: b.tx_count,
    size: b.size,
    extras: {
      totalFees: 0,
      medianFee: undefined,
      feeRange: undefined,
      pool: { name: "?" },
      reward: 0,
    },
  };
}

export async function GET() {
  // Try mempool.space first
  try {
    const [blocks, mempool] = await Promise.all([
      fetchJSON("https://mempool.space/api/blocks"),
      fetchJSON("https://mempool.space/api/mempool/blocks"),
    ]);
    return NextResponse.json({ blocks, mempool }, {
      headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" },
    });
  } catch {
    // Fallback: blockstream.info (no mempool projections)
    try {
      const raw: Record<string, unknown>[] = await fetchJSON("https://blockstream.info/api/blocks");
      const blocks = raw.map(toMempoolShape);
      return NextResponse.json({ blocks, mempool: [] }, {
        headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" },
      });
    } catch (err2) {
      return NextResponse.json(
        { error: err2 instanceof Error ? err2.message : "fetch failed" },
        { status: 502 }
      );
    }
  }
}
