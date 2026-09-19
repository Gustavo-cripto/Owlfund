import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Tabelas do utilizador a limpar. profiles usa `id`; as restantes usam `user_id`.
//
// A lista tinha 8 tabelas e o codigo usa 18. Ficavam para tras, com o user_id
// la dentro: os enderecos que a pessoa vigiava (e as etiquetas que lhes pos),
// os pagamentos em cripto (com o tx_hash, que liga a uma carteira real), e os
// registos de notificacoes. O botao promete "apagar a conta e todos os dados" e
// a politica de privacidade diz que sao removidos de imediato.
//
// Quando se acrescentar uma tabela nova com user_id, acrescentar aqui tambem.
const USER_TABLES = [
  "api_keys",
  "chat_usage",
  "crypto_payments",
  "founders",
  "mfa_recovery_codes",
  "news_briefing_schedule",
  "notification_log",
  "portfolio_snapshots",
  "smart_money_watchlist",
  "subscriptions",
  "wallet_config",
  "webhook_config",
  "whale_alert_log",
] as const;

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const userId = user.id;

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  // 1. Best-effort: cancelar subscrições Stripe ativas (não bloqueia a eliminação).
  try {
    const { data: profile } = await admin
      .from("profiles").select("stripe_customer_id").eq("id", userId).maybeSingle();
    const customerId = profile?.stripe_customer_id as string | undefined;
    if (customerId) {
      const { getStripe } = await import("@/lib/stripe");
      const stripe = getStripe();
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 20 });
      await Promise.allSettled(subs.data.map((s) => stripe.subscriptions.cancel(s.id)));
    }
  } catch { /* best-effort */ }

  // 2. Apagar linhas do utilizador em cada tabela.
  //
  // Os erros deixam de ser engolidos: cada `catch` silencioso fazia um
  // apagamento PARCIAL passar por completo, e o utilizador saia convencido de
  // que nao ficou nada.
  const falhas: string[] = [];
  const apagar = async (nome: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    try {
      const { error } = await fn();
      if (error) { falhas.push(nome); console.error(`[account/delete] ${nome}:`, error.message); }
    } catch (e) {
      falhas.push(nome);
      console.error(`[account/delete] ${nome}:`, e instanceof Error ? e.message : e);
    }
  };

  for (const table of USER_TABLES) {
    await apagar(table, () => admin.from(table).delete().eq("user_id", userId));
  }
  await apagar("profiles", () => admin.from("profiles").delete().eq("id", userId));
  // Inscrição no beta é por email (sem user_id).
  if (user.email) {
    const email = user.email.toLowerCase();
    await apagar("beta_signups", () => admin.from("beta_signups").delete().eq("email", email));
  }

  // 3. Apagar ficheiros de avatar do storage (best-effort).
  try {
    const { data: files } = await admin.storage.from("avatars").list(userId);
    if (files && files.length > 0) {
      await admin.storage.from("avatars").remove(files.map((f) => `${userId}/${f.name}`));
    }
  } catch { /* ignore */ }

  // 4. Apagar o utilizador de autenticação (passo final e irreversível).
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: "Não foi possível apagar a conta." }, { status: 500 });
  }

  // Diz-se a verdade sobre o que ficou. Uma tabela que falhou nao pode passar
  // por "apagado tudo" — o utilizador tem direito a saber e a voltar a pedir.
  if (falhas.length > 0) {
    console.error("[account/delete] apagamento PARCIAL:", userId, falhas.join(", "));
    return NextResponse.json({ deleted: true, partial: true, tables: falhas.length });
  }
  return NextResponse.json({ deleted: true });
}
