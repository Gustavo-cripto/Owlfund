// Atribuição de plano a um tester (60 dias), partilhada entre a rota admin e o
// webhook do Telegram. O tester tem de já ter criado conta (auth.users).
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";
const TRIAL_DAYS = 60;

export type GrantResult = { ok: boolean; error?: string; until?: string };

export async function grantTester(emailRaw: string, plan: "pro" | "premium", opts: { force?: boolean } = {}): Promise<GrantResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Email inválido." };

  const admin = getSupabaseAdmin();

  // Procura o utilizador pelo email (páginas; cobre alguns milhares).
  let userId: string | null = null;
  for (let page = 1; page <= 5; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    const u = data.users.find((x) => (x.email ?? "").toLowerCase() === email);
    if (u) { userId = u.id; break; }
    if (data.users.length < 1000) break;
  }
  if (!userId) return { ok: false, error: "Este email ainda não tem conta no site." };

  // Nunca sobrescrever uma subscrição PAGA ativa (Stripe/cripto) com um trial manual.
  if (!opts.force) {
    const { data: existing } = await admin
      .from("subscriptions")
      .select("status, source, current_period_end")
      .eq("user_id", userId)
      .maybeSingle();
    const paidActive = existing && existing.status === "active" && existing.source && existing.source !== "manual"
      && (!existing.current_period_end || new Date(existing.current_period_end as string).getTime() > Date.now());
    if (paidActive) return { ok: false, error: `Este utilizador já tem uma subscrição paga ativa (${existing.source}). Não foi alterada.` };
  }

  const end = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const price_id = plan === "premium" ? premiumPriceId || "manual_premium" : "manual_pro";

  const { error } = await admin.from("subscriptions").upsert(
    { user_id: userId, status: "active", price_id, current_period_end: end.toISOString(), cancel_at_period_end: false, source: "manual" },
    { onConflict: "user_id" },
  );
  if (error) return { ok: false, error: error.message };

  try {
    await admin.from("beta_signups").update({ status: "activated" }).eq("email", email).eq("status", "pending");
  } catch { /* tabela pode não existir */ }

  return { ok: true, until: end.toISOString() };
}
