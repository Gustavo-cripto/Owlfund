import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    });

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return NextResponse.json({ plan: "free", error: "unauthenticated" }, { status: 401 });

    // Várias linhas ativas (Stripe + cripto + beta) → a que expira mais tarde manda.
    const { data: sub, error } = await supabase
      .from("subscriptions")
      .select("status, price_id, current_period_end")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("current_period_end", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (error) return NextResponse.json({ plan: "free", error: "db" }, { status: 500 });

    if (!sub) return NextResponse.json({ plan: "free" });

    const plan =
      premiumPriceId && sub.price_id === premiumPriceId ? "premium" : "pro";

    return NextResponse.json({ plan });
  } catch {
    return NextResponse.json({ plan: "free", error: "internal" }, { status: 500 });
  }
}
