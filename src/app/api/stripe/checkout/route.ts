import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getStripe } from "@/lib/stripe";
import { isFounder } from "@/lib/beta/founder";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export async function POST(request: Request) {
  // Pagamentos congelados durante o beta — no lançamento define
  // NEXT_PUBLIC_PAYMENTS_ENABLED=true na Vercel (a UI de /pricing usa a mesma flag).
  if (process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== "true") {
    return NextResponse.json(
      { error: "Os pagamentos abrem no lançamento. Durante o beta, o acesso Pro/Premium é gratuito — inscreve-te em chainfolioai.com/beta." },
      { status: 403 },
    );
  }

  let user: { id: string; email?: string } | null = null;

  // 1a. Tentar pelo Bearer token (anon client — verifica JWT do Supabase)
  const authHeader = request.headers.get("Authorization");
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (accessToken && supabaseUrl && supabaseAnonKey) {
    try {
      const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
      const { data } = await client.auth.getUser(accessToken);
      if (data.user) user = data.user;
    } catch {
      // continua para o fallback
    }
  }

  // 1b. Fallback: cookies SSR
  if (!user) {
    try {
      const cookieStore = await cookies();
      const supabaseAuth = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
          get: (name) => cookieStore.get(name)?.value,
          set: () => {},
          remove: () => {},
        },
      });
      const { data } = await supabaseAuth.auth.getUser();
      if (data.user) user = data.user;
    } catch {
      // continua
    }
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body2 = await request.json().catch(() => ({})) as { userId?: string; plan?: string; interval?: string };
  const plan = body2.plan ?? "pro";
  const annual = body2.interval === "year";

  // Preço de fundador (beta testers): usa os price IDs STRIPE_FOUNDER_* quando
  // existirem (Pro €9,99 / Premium €19, vitalício). Sem eles, cai no preço normal
  // e fica registado no log — para o Gustavo criar os preços no Stripe.
  const founder = await isFounder(user.id);
  const founderPrice = founder
    ? (plan === "premium"
        ? (annual ? process.env.STRIPE_FOUNDER_PREMIUM_PRICE_ID_ANNUAL : process.env.STRIPE_FOUNDER_PREMIUM_PRICE_ID)
        : (annual ? process.env.STRIPE_FOUNDER_PRO_PRICE_ID_ANNUAL : process.env.STRIPE_FOUNDER_PRO_PRICE_ID))
    : undefined;
  if (founder && !founderPrice) console.error(`[stripe/checkout] fundador ${user.id} sem STRIPE_FOUNDER_*_PRICE_ID (${plan}/${annual ? "anual" : "mensal"}) — a usar preço normal`);
  const priceId = founderPrice ?? (plan === "premium"
    ? (annual
        ? process.env.STRIPE_PREMIUM_PRICE_ID_ANNUAL
        : (process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID))
    : (annual ? process.env.STRIPE_PRICE_ID_ANNUAL : process.env.STRIPE_PRICE_ID));
  if (!priceId) {
    return NextResponse.json(
      { error: annual ? "Preço anual não configurado." : "Stripe price não configurado." },
      { status: 503 },
    );
  }

  const stripe = getStripe();

  // 2. Tentar obter/criar customer Stripe (opcional — precisa da service role key)
  let customerId: string | null = null;

  if (supabaseServiceKey) {
    try {
      const adminClient = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });
      const { data: profile } = await adminClient
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .maybeSingle();
      customerId = profile?.stripe_customer_id ?? null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email ?? "",
          metadata: { user_id: user.id },
        });
        customerId = customer.id;
        await adminClient.from("profiles").upsert({ id: user.id, stripe_customer_id: customerId });
      }
    } catch {
      // sem service role — cria sessão sem customer fixo
    }
  }

  // 3. Criar sessão Stripe Checkout
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    ...(customerId ? { customer: customerId } : { customer_email: user.email ?? undefined }),
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { user_id: user.id, plan, founder: founder ? "1" : "0" },
    success_url: `${siteUrl}/account?checkout=success`,
    cancel_url: `${siteUrl}/pricing?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
