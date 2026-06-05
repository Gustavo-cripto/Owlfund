import { NextResponse } from "next/server";

export const runtime = "edge";

async function fetchJSON(url: string) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 20 },
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function GET() {
  try {
    const [blocks, mempool] = await Promise.all([
      fetchJSON("https://mempool.space/api/blocks"),
      fetchJSON("https://mempool.space/api/mempool/blocks"),
    ]);
    return NextResponse.json({ blocks, mempool }, {
      headers: { "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 }
    );
  }
}
