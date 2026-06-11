import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? "";

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
    if (!user) return NextResponse.json({ plan: "free" });

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status, price_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!sub) return NextResponse.json({ plan: "free" });

    const plan =
      premiumPriceId && sub.price_id === premiumPriceId ? "premium" : "pro";

    return NextResponse.json({ plan });
  } catch {
    return NextResponse.json({ plan: "free" });
  }
}
