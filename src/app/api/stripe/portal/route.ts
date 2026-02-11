import { NextResponse } from "next/server";

import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export async function POST(request: Request) {
  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();
  const body = (await request.json().catch(() => null)) as { userId?: string } | null;

  if (!body?.userId) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", body.userId)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: "Cliente Stripe não encontrado." }, { status: 404 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${siteUrl}/account`,
  });

  return NextResponse.json({ url: session.url });
}
