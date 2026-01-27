import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

const upsertSubscription = async (subscription: Stripe.Subscription) => {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!profile?.id) return;

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  // Stripe types podem variar por versão; garantimos compatibilidade.
  const currentPeriodEndUnix = (subscription as unknown as { current_period_end?: number })
    .current_period_end;
  const currentPeriodEnd = currentPeriodEndUnix
    ? new Date(currentPeriodEndUnix * 1000).toISOString()
    : null;

  await supabaseAdmin.from("subscriptions").upsert({
    user_id: profile.id,
    status: subscription.status,
    price_id: priceId,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
  });
};

export async function POST(request: Request) {
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET não configurada." },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Assinatura ausente." }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook inválido." },
      { status: 400 }
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        await upsertSubscription(subscription);
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      await upsertSubscription(subscription);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro no webhook." },
      { status: 500 }
    );
  }
}
