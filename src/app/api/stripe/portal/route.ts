import { NextResponse } from "next/server";
import { apiMsg } from "@/lib/api/apiMessages";

import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

export async function POST(request: Request) {
  // Verificar sessão — não aceitar userId do body
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stripe = getStripe();
  const supabaseAdmin = getSupabaseAdmin();

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json({ error: apiMsg(request, "no_subscription") }, { status: 404 });
  }

  // CONFIRMAR A POSSE antes de abrir o portal.
  //
  // O `stripe_customer_id` vive na tabela `profiles`, onde o browser tambem
  // escreve. As regras de acesso do Postgres limitam LINHAS, nao COLUNAS: sem
  // permissoes por coluna definidas, a mesma sessao que grava a fotografia de
  // perfil podia gravar um identificador de cliente alheio nesta coluna — e o
  // portal de faturacao abria a conta de outra pessoa, com historico de
  // pagamentos e cartoes.
  //
  // A ligacao de confianca e o metadata que o checkout grava no cliente Stripe.
  // Quando o cliente foi criado pelo proprio Checkout, esse metadata pode nao
  // existir; nesse caso exige-se pelo menos que o email bata certo.
  try {
    const cliente = await stripe.customers.retrieve(profile.stripe_customer_id);
    if (cliente.deleted) {
      return NextResponse.json({ error: apiMsg(request, "no_subscription") }, { status: 404 });
    }
    const donoDeclarado = cliente.metadata?.user_id;
    const pertence = donoDeclarado
      ? donoDeclarado === user.id
      : !!cliente.email && !!user.email && cliente.email.toLowerCase() === user.email.toLowerCase();
    if (!pertence) {
      console.error("[stripe-portal] cliente nao pertence a quem pede:", user.id, profile.stripe_customer_id);
      return NextResponse.json({ error: apiMsg(request, "no_subscription") }, { status: 403 });
    }
  } catch (e) {
    console.error("[stripe-portal] nao foi possivel confirmar o cliente:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: apiMsg(request, "no_subscription") }, { status: 503 });
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${siteUrl}/account`,
  });

  return NextResponse.json({ url: session.url });
}
