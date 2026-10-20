import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { emitirFaturaRecibo, faturacaoAtiva } from "@/lib/faturacao/invoicexpress";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";

// Stripe SDK muda bastante a tipagem entre versões; aqui preferimos ser permissivos
// para não bloquear o build da Vercel.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const upsertSubscription = async (subscription: any) => {
  const supabaseAdmin = getSupabaseAdmin();
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  let userId = profile?.id;

  // Fallback: look up by email via Stripe customer object
  if (!userId) {
    try {
      const stripe = getStripe();
      const customer = await stripe.customers.retrieve(customerId);
      const email = !customer.deleted && "email" in customer ? customer.email : null;
      if (email) {
        const { data: profileByEmail } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("email", email)
          .maybeSingle();
        if (profileByEmail?.id) {
          userId = profileByEmail.id;
          // Save customer_id for next time
          await supabaseAdmin
            .from("profiles")
            .update({ stripe_customer_id: customerId })
            .eq("id", userId);
        }
      }
    } catch { /* ignore */ }
  }

  if (!userId) return;

  const priceId = subscription.items?.data?.[0]?.price?.id ?? null;
  const currentPeriodEndUnix = subscription.current_period_end as number | undefined;
  const currentPeriodEnd = currentPeriodEndUnix
    ? new Date(currentPeriodEndUnix * 1000).toISOString()
    : null;

  // O resultado nao era lido: se a escrita falhasse, o webhook respondia 200, a
  // Stripe dava o evento por entregue e nunca mais o repetia — e o cliente que
  // pagou ficava sem plano, em silencio. Agora falha alto, para a Stripe voltar
  // a tentar.
  //
  // A chave de conflito e `user_id`: a tabela tem um indice unico
  // `subscriptions_user_id_key`, ou seja UMA linha por conta (confirmado na base
  // de dados a 20 set 2026). Sem o onConflict, o upsert usava a chave primaria
  // (`id`), que nao vai no corpo — logo tentava INSERIR e violava o indice unico
  // para quem JA tinha subscricao. Ou seja: a atualizacao de plano de um cliente
  // existente falhava sempre, e o erro era engolido.
  const { error: erroSub } = await supabaseAdmin.from("subscriptions").upsert({
    user_id: userId,
    status: subscription.status,
    price_id: priceId,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
    source: "stripe",
  }, { onConflict: "user_id" });
  if (erroSub) {
    console.error("[stripe-webhook] subscricao NAO gravada:", userId, erroSub.message);
    throw new Error(`subscriptions upsert: ${erroSub.message}`);
  }
};

export async function POST(request: Request) {
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET não configurada." },
      { status: 500 }
    );
  }

  const stripe = getStripe();

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
      // NIF dado no pagamento → no cliente Stripe, para as faturas de cada renovação.
      const nif = session.custom_fields?.find((c) => c.key === "nif")?.text?.value?.trim();
      const cliente = typeof session.customer === "string" ? session.customer : session.customer?.id;
      if (nif && cliente) {
        try { await stripe.customers.update(cliente, { metadata: { nif } }); } catch (e) { console.error("[stripe-webhook] guardar NIF:", e instanceof Error ? e.message : e); }
      }
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

    // Cada pagamento cobrado (1.º e renovações) → fatura-recibo no InvoiceXpress.
    // Nunca devolve erro ao Stripe por causa da fatura (a repetição podia
    // duplicá-la): se falhar, avisa o dono no Telegram para a emitir à mão.
    if (event.type === "invoice.paid" && faturacaoAtiva()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inv = event.data.object as any;
      const pago = Number(inv.amount_paid ?? 0) / 100;
      if (pago > 0 && String(inv.currency ?? "eur").toLowerCase() === "eur") {
        const clienteId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id ?? "";
        let nif: string | null = null;
        try { const c = await stripe.customers.retrieve(clienteId); if (!c.deleted) nif = (c.metadata?.nif as string | undefined) ?? null; } catch { /* sem NIF */ }
        const linha = inv.lines?.data?.[0];
        const r = await emitirFaturaRecibo({
          idUnico: `stripe-${inv.id}`,
          codigoCliente: clienteId || inv.customer_email || "cliente",
          nome: inv.customer_name ?? "",
          email: inv.customer_email ?? "",
          nif,
          pais: inv.customer_address?.country ?? null,
          descricao: linha?.description ?? "Subscrição ChainFolioAI",
          totalEur: pago,
          data: new Date((inv.status_transitions?.paid_at ?? inv.created ?? Date.now() / 1000) * 1000),
        });
        if (!r.ok && !r.duplicado) {
          console.error("[faturacao] Stripe", inv.id, r.erro);
          await sendTelegram(`⚠️ <b>Fatura NÃO emitida</b> (Stripe ${tgEsc(String(inv.id))})
${tgEsc(inv.customer_email ?? "")} · ${pago.toFixed(2)} €
Motivo: ${tgEsc(r.erro)}
▶ Emite-a à mão no InvoiceXpress.`).catch(() => false);
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro no webhook." },
      { status: 500 }
    );
  }
}
