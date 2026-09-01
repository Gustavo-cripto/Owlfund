import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { scanWatchlist, type WatchEntry } from "@/lib/api/whales";

export const runtime = "edge";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });

  const { data: userData } = await supabase.auth.getUser();
  let user = userData.user;
  // Cliente para consultar a BD respeitando RLS: cookies por defeito; com
  // Bearer (app mobile) usa um cliente autenticado com o próprio token.
  let db: Pick<typeof supabase, "from"> = supabase;
  if (!user) {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (token) {
      try {
        const viaTokenClient = createClient(supabaseUrl, supabaseAnonKey, {
          auth: { persistSession: false },
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data: viaToken } = await viaTokenClient.auth.getUser(token);
        user = viaToken.user ?? null;
        if (user) db = viaTokenClient;
      } catch { /* fica null */ }
    }
  }
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data: sub } = await db.from("subscriptions")
    .select("status, price_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
  const isPremium = !!premiumPriceId && sub?.price_id === premiumPriceId;
  if (!isPremium) return NextResponse.json({ error: "Requer Premium." }, { status: 403 });

  const watchlistParam = req.nextUrl.searchParams.get("watchlist");
  let watchlist: WatchEntry[] = [];
  try {
    watchlist = watchlistParam ? (JSON.parse(watchlistParam) as WatchEntry[]) : [];
  } catch { watchlist = []; }

  const { movements, scanned } = await scanWatchlist(watchlist);
  return NextResponse.json({ movements, scanned, timestamp: Date.now() });
}
