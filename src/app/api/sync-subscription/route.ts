import { NextResponse } from "next/server";
import { apiMsg } from "@/lib/api/apiMessages";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function POST(request: Request) {
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

    // Exigir email CONFIRMADO antes de ligar seja o que for.
    //
    // Esta rota liga a conta a um cliente da Stripe so por o email bater certo.
    // Sem confirmacao de email, bastava registar uma conta nova com o email de
    // outra pessoa para herdar a subscricao dela — e o portal de faturacao a
    // seguir. O registo envia sempre confirmacao, mas isso e o cliente; a regra
    // tem de estar aqui.
    const confirmado = (user as { email_confirmed_at?: string | null }).email_confirmed_at;
    if (!confirmado) {
      return NextResponse.json(
        { error: "Confirma o teu email antes de sincronizar o plano.", code: "email_not_confirmed" },
        { status: 403 },
      );
    }

    // Preferir a ligacao forte: o checkout grava metadata.user_id no cliente.
    // So quando essa nao existe (cliente criado pelo proprio Checkout) e que se
    // cai para a correspondencia por email.
    let customer: { id: string } | null = null;
    try {
      const porMetadata = await stripe.customers.search({
        query: `metadata['user_id']:'${user.id}'`,
        limit: 1,
      });
      if (porMetadata.data.length) customer = porMetadata.data[0];
    } catch (e) {
      console.error("[sync-subscription] pesquisa por metadata falhou:", e instanceof Error ? e.message : e);
    }

    if (!customer) {
      const customers = await stripe.customers.list({ email: user.email, limit: 5 });
      if (!customers.data.length) {
        return NextResponse.json({ error: "No Stripe customer found for this email" }, { status: 404 });
      }
      // Nunca aceitar um cliente que declare pertencer a OUTRA conta.
      const alheio = customers.data.find((c) => c.metadata?.user_id && c.metadata.user_id !== user.id);
      if (alheio) {
        console.error("[sync-subscription] cliente declara outro dono:", user.id, alheio.id);
        return NextResponse.json({ error: "No Stripe customer found for this email" }, { status: 404 });
      }
      customer = customers.data[0];
    }

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
    const periodEnd = (sub as unknown as { current_period_end?: number }).current_period_end;
    const currentPeriodEnd = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;

    await supabaseAdmin.from("subscriptions").upsert({
      user_id: user.id,
      status: sub.status,
      price_id: priceId,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
    }, { onConflict: "user_id" });

    return NextResponse.json({ synced: true, price_id: priceId, status: sub.status });
  } catch (err) {
    console.error("[sync-subscription]", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: apiMsg(request, "sync_failed") },
      { status: 500 }
    );
  }
}
