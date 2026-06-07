import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = {
  Accept: "application/json",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

async function fetchJSON(url: string, timeoutMs = 8000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: ctrl.signal });
    if (!res.ok) throw new Error(`${res.status}`);
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  let blocks: unknown[] = [];
  let mempool: unknown[] = [];

  // ── Confirmed blocks ──────────────────────────────────────────────────────
  // /api/v1/blocks returns full data including extras (fees + pool)
  // Works from Vercel IPs (tested ✓)
  const BLOCK_SOURCES = [
    "https://mempool.space/api/v1/blocks",
    "https://mempool.space/api/v1/blocks/0",   // fallback with different path
  ];

  for (const url of BLOCK_SOURCES) {
    try {
      const data = await fetchJSON(url);
      if (Array.isArray(data) && data.length > 0 && data[0]?.height) {
        blocks = data.slice(0, 8);
        break;
      }
    } catch { /* try next */ }
  }

  // Last resort: blockstream (no fees/pool but at least height/tx)
  if (blocks.length === 0) {
    try {
      type BsBlock = { height: number; timestamp: number; tx_count: number; size: number };
      const raw = (await fetchJSON("https://blockstream.info/api/blocks")) as BsBlock[];
      blocks = raw.slice(0, 8).map((b) => ({
        height: b.height,
        timestamp: b.timestamp,
        tx_count: b.tx_count,
        size: b.size,
        extras: {
          totalFees: 0,
          medianFee: 1,
          feeRange: [1, 1, 2],
          pool: { name: "Unknown" },
          reward: 312500000,
        },
      }));
    } catch { /* keep empty */ }
  }

  // ── Mempool pending blocks ────────────────────────────────────────────────
  try {
    const data = await fetchJSON("https://mempool.space/api/v1/fees/mempool-blocks", 5000);
    if (Array.isArray(data) && data.length > 0) {
      mempool = data.slice(0, 3);
    }
  } catch {
    // Try old endpoint as fallback
    try {
      const data = await fetchJSON("https://mempool.space/api/mempool/blocks", 5000);
      if (Array.isArray(data)) mempool = data.slice(0, 3);
    } catch { /* silent */ }
  }

  return NextResponse.json({ blocks, mempool }, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" },
  });
}
