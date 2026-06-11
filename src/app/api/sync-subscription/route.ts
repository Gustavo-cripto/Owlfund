import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function POST() {
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
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

    const stripe = getStripe();
    const supabaseAdmin = getSupabaseAdmin();

    // Find Stripe customer by email
    const customers = await stripe.customers.list({ email: user.email, limit: 5 });
    if (!customers.data.length) {
      return NextResponse.json({ error: "No Stripe customer found for this email" }, { status: 404 });
    }

    // Use the most recent customer
    const customer = customers.data[0];

    // Update stripe_customer_id in profiles if missing
    await supabaseAdmin
      .from("profiles")
      .update({ stripe_customer_id: customer.id })
      .eq("id", user.id);

    // Get active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "active",
      limit: 5,
    });

    if (!subscriptions.data.length) {
      return NextResponse.json({ synced: false, message: "No active Stripe subscription found" });
    }

    // Upsert the most recent active subscription
    const sub = subscriptions.data[0];
    const priceId = sub.items.data[0]?.price?.id ?? null;
    const currentPeriodEnd = sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null;

    await supabaseAdmin.from("subscriptions").upsert({
      user_id: user.id,
      status: sub.status,
      price_id: priceId,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
    });

    return NextResponse.json({ synced: true, price_id: priceId, status: sub.status });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
