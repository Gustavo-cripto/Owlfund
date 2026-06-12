import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "edge";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? "";

type WatchEntry = { address: string; label: string; chain: "eth" | "sol" | "btc" };
type Movement = {
  address: string;
  label: string;
  chain: string;
  type: "large_transfer" | "accumulation" | "distribution" | "new_token";
  description: string;
  usdValue: number;
  timestamp: number;
};

async function fetchEthMovements(address: string, label: string): Promise<Movement[]> {
  try {
    const apiKey = process.env.MORALIS_API_KEY ?? "";
    if (!apiKey) return [];
    const res = await fetch(
      `https://deep-index.moralis.io/api/v2.2/${address}/erc20/transfers?chain=eth&limit=5`,
      { headers: { "X-API-Key": apiKey }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = await res.json() as { result?: Array<{ value: string; token_decimals: string; token_symbol: string; block_timestamp: string }> };
    const movs: Movement[] = [];
    for (const tx of data.result ?? []) {
      const decimals = parseInt(tx.token_decimals ?? "18");
      const amount = parseInt(tx.value ?? "0") / Math.pow(10, decimals);
      if (amount > 0) {
        movs.push({
          address, label, chain: "eth",
          type: amount > 100000 ? "large_transfer" : "accumulation",
          description: `${amount.toFixed(2)} ${tx.token_symbol}`,
          usdValue: 0,
          timestamp: new Date(tx.block_timestamp).getTime(),
        });
      }
    }
    return movs.slice(0, 2);
  } catch { return []; }
}

async function fetchBtcMovements(address: string, label: string): Promise<Movement[]> {
  try {
    const res = await fetch(
      `https://mempool.space/api/address/${address}/txs`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const txs = await res.json() as Array<{ txid: string; status: { block_time: number }; vout: Array<{ value: number }> }>;
    if (!txs?.length) return [];
    const latest = txs[0];
    const totalSats = (latest.vout ?? []).reduce((s: number, o) => s + (o.value ?? 0), 0);
    const btcValue = totalSats / 1e8;
    if (btcValue < 0.01) return [];
    return [{
      address, label, chain: "btc",
      type: btcValue > 1 ? "large_transfer" : "accumulation",
      description: `${btcValue.toFixed(4)} BTC`,
      usdValue: 0,
      timestamp: (latest.status?.block_time ?? Date.now() / 1000) * 1000,
    }];
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: sub } = await supabase.from("subscriptions")
    .select("status, price_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
  const isPremium = !!premiumPriceId && sub?.price_id === premiumPriceId;
  if (!isPremium) return NextResponse.json({ error: "Requer Premium." }, { status: 403 });

  // Parse watchlist from query param (sent by frontend)
  const watchlistParam = req.nextUrl.searchParams.get("watchlist");
  let watchlist: WatchEntry[] = [];
  try {
    watchlist = watchlistParam ? (JSON.parse(watchlistParam) as WatchEntry[]).slice(0, 10) : [];
  } catch { watchlist = []; }

  if (!watchlist.length) return NextResponse.json({ movements: [], scanned: 0 });

  // Fetch movements in parallel
  const results = await Promise.allSettled(
    watchlist.map(entry => {
      if (entry.chain === "btc") return fetchBtcMovements(entry.address, entry.label);
      if (entry.chain === "eth") return fetchEthMovements(entry.address, entry.label);
      return Promise.resolve([] as Movement[]);
    })
  );

  const movements: Movement[] = results
    .flatMap(r => r.status === "fulfilled" ? r.value : [])
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);

  return NextResponse.json({
    movements,
    scanned: watchlist.length,
    timestamp: Date.now(),
  });
}
