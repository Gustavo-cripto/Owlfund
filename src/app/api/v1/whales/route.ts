import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/api/auth";
import { scanWatchlist, type WatchEntry } from "@/lib/api/whales";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/v1/whales?watchlist=<JSON> — movimentos recentes dos endereços dados.
// watchlist: array url-encoded de { address, chain: "eth"|"btc"|"sol", label }.
// Ex.: /api/v1/whales?watchlist=%5B%7B%22address%22%3A%220x…%22%2C%22chain%22%3A%22eth%22%2C%22label%22%3A%22Baleia%22%7D%5D
export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth.ok) return auth.response;

  const raw = req.nextUrl.searchParams.get("watchlist");
  if (!raw) {
    return NextResponse.json(
      { error: "missing_watchlist", message: "Passa ?watchlist=<JSON url-encoded> com [{ address, chain, label }]." },
      { status: 400 },
    );
  }

  let watchlist: WatchEntry[];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("not array");
    watchlist = parsed as WatchEntry[];
  } catch {
    return NextResponse.json(
      { error: "invalid_watchlist", message: "watchlist tem de ser um array JSON válido de { address, chain, label }." },
      { status: 400 },
    );
  }

  const { movements, scanned } = await scanWatchlist(watchlist);
  return NextResponse.json({ movements, scanned, timestamp: Date.now() });
}
