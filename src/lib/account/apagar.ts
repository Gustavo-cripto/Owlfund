// Apagar uma conta e TODOS os dados dela. Usado pelo próprio cliente
// (/api/account/delete) e pelo admin (/api/admin/apagar-conta, contas de teste
// ou a pedido do cliente). Um só sítio para a lista de tabelas: antes vivia na
// rota do cliente e faltavam cex_keys (chaves de exchange cifradas!) e
// email_optout (14 out 2026).
//
// Quando se acrescentar uma tabela nova com user_id, acrescentar aqui também.

import type { SupabaseClient } from "@supabase/supabase-js";

// profiles usa `id`; as restantes usam `user_id`.
export const USER_TABLES = [
  "api_keys",
  "cex_keys",
  "chat_usage",
  "crypto_payments",
  "email_optout",
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

export type ResultadoApagar = { apagada: boolean; falhas: string[] };

export async function apagarContaETudo(admin: SupabaseClient, userId: string, email: string | null | undefined): Promise<ResultadoApagar> {
  // 1. Best-effort: cancelar subscrições Stripe ativas (não bloqueia a eliminação).
  try {
    const { data: profile } = await admin.from("profiles").select("stripe_customer_id").eq("id", userId).maybeSingle();
    const customerId = profile?.stripe_customer_id as string | undefined;
    if (customerId) {
      const { getStripe } = await import("@/lib/stripe");
      const stripe = getStripe();
      const subs = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 20 });
      await Promise.allSettled(subs.data.map((s) => stripe.subscriptions.cancel(s.id)));
    }
  } catch { /* best-effort */ }

  // 2. Apagar linhas do utilizador em cada tabela. Os erros não são engolidos:
  // um apagamento PARCIAL não pode passar por completo.
  const falhas: string[] = [];
  const apagar = async (nome: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    try {
      const { error } = await fn();
      if (error) { falhas.push(nome); console.error(`[apagar-conta] ${nome}:`, error.message); }
    } catch (e) {
      falhas.push(nome);
      console.error(`[apagar-conta] ${nome}:`, e instanceof Error ? e.message : e);
    }
  };
  for (const table of USER_TABLES) {
    await apagar(table, () => admin.from(table).delete().eq("user_id", userId));
  }
  await apagar("profiles", () => admin.from("profiles").delete().eq("id", userId));
  // Inscrição no beta é por email (sem user_id).
  if (email) {
    const e = email.toLowerCase();
    await apagar("beta_signups", () => admin.from("beta_signups").delete().eq("email", e));
  }

  // 3. Avatar no storage (best-effort).
  try {
    const { data: files } = await admin.storage.from("avatars").list(userId);
    if (files && files.length > 0) await admin.storage.from("avatars").remove(files.map((f) => `${userId}/${f.name}`));
  } catch { /* ignore */ }

  // 4. O utilizador de autenticação (passo final e irreversível).
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("[apagar-conta] deleteUser:", error.message);
    return { apagada: false, falhas };
  }
  if (falhas.length) console.error("[apagar-conta] apagamento PARCIAL:", userId, falhas.join(", "));
  return { apagada: true, falhas };
}
