import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// Tabelas do utilizador a limpar. profiles usa `id`; as restantes usam `user_id`.
const USER_TABLES = [
  "api_keys",
  "chat_usage",
  "mfa_recovery_codes",
  "news_briefing_schedule",
  "portfolio_snapshots",
  "subscriptions",
  "wallet_config",
  "webhook_config",
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

  // 2. Apagar linhas do utilizador em cada tabela (best-effort por tabela).
  for (const table of USER_TABLES) {
    try { await admin.from(table).delete().eq("user_id", userId); } catch { /* ignore */ }
  }
  try { await admin.from("profiles").delete().eq("id", userId); } catch { /* ignore */ }
  // Inscrição no beta é por email (sem user_id).
  try { if (user.email) await admin.from("beta_signups").delete().eq("email", user.email.toLowerCase()); } catch { /* ignore */ }

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

  return NextResponse.json({ deleted: true });
}
