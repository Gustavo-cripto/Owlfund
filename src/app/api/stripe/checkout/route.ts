import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export async function POST(request: Request) {
  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();
  const body = (await request.json().catch(() => null)) as
    | { userId?: string; email?: string }
    | null;

  if (!body?.userId || !body?.email) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const priceId = process.env.STRIPE_PRICE_ID;
  if (!priceId) {
    return NextResponse.json({ error: "STRIPE_PRICE_ID não configurada." }, { status: 500 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", body.userId)
    .maybeSingle();

  let customerId = profile?.stripe_customer_id ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: body.email,
      metadata: {
        user_id: body.userId,
      },
    });
    customerId = customer.id;
    await supabaseAdmin
      .from("profiles")
      .upsert({ id: body.userId, stripe_customer_id: customerId });
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId ?? undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${siteUrl}/portfolio?success=1`,
    cancel_url: `${siteUrl}/portfolio?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
