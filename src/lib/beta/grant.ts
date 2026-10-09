// Atribuição de plano a um tester (60 dias), partilhada entre a rota admin e o
// webhook do Telegram. O tester tem de já ter criado conta (auth.users).
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";
const TRIAL_DAYS = 60;

export type GrantResult = {
  ok: boolean;
  error?: string;
  until?: string;
  /** Com onlyIfPending: a inscrição já tinha sido tratada; nada foi alterado. */
  jaTratado?: boolean;
};

export const AUTH_INDISPONIVEL = "Auth indisponível, tenta de novo.";

// Até 50 000 contas. Pára na primeira página incompleta, por isso o custo só
// cresce com o número real de contas.
const MAX_PAGINAS = 50;

/**
 * Procura o id da conta pelo email exato. Não há tabela com o email de todos
 * (o profiles não o garante), por isso pagina o auth.users. Uma falha da Auth
 * API devolve `error` — nunca "sem conta", que levaria a pedir ao tester que
 * se registasse outra vez.
 */
export async function procurarContaPorEmail(emailRaw: string): Promise<{ userId: string | null; error?: string }> {
  const email = emailRaw.trim().toLowerCase();
  const admin = getSupabaseAdmin();
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    let users: { id: string; email?: string | null }[];
    try {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error || !data) {
        console.error("[beta] listUsers:", error?.message ?? "sem dados");
        return { userId: null, error: AUTH_INDISPONIVEL };
      }
      users = data.users;
    } catch (e) {
      console.error("[beta] listUsers:", e instanceof Error ? e.message : e);
      return { userId: null, error: AUTH_INDISPONIVEL };
    }
    const u = users.find((x) => (x.email ?? "").toLowerCase() === email);
    if (u) return { userId: u.id };
    if (users.length < 1000) break;
  }
  return { userId: null };
}

export async function grantTester(
  emailRaw: string,
  plan: "pro" | "premium",
  opts: {
    force?: boolean;
    /**
     * Só para o webhook do Telegram: os botões antigos continuam clicáveis e o
     * Telegram pode reentregar um clique. Só atribui se a inscrição ainda
     * estiver pendente e não houver um plano de tester ativo; senão devolve
     * jaTratado sem mexer em nada. O painel não usa isto (lá, prolongar pode
     * ser intencional).
     */
    onlyIfPending?: boolean;
  } = {},
): Promise<GrantResult> {
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: "Email inválido." };

  const admin = getSupabaseAdmin();

  const conta = await procurarContaPorEmail(email);
  if (conta.error) return { ok: false, error: conta.error };
  const userId = conta.userId;
  if (!userId) return { ok: false, error: "Este email ainda não tem conta no site." };

  const { data: existing, error: subErr } = await admin
    .from("subscriptions")
    .select("status, source, current_period_end")
    .eq("user_id", userId)
    .maybeSingle();
  if (subErr && opts.onlyIfPending) return { ok: false, error: "Base de dados indisponível, tenta de novo." };
  const ativa = !!existing && existing.status === "active"
    && (!existing.current_period_end || new Date(existing.current_period_end as string).getTime() > Date.now());

  // Nunca sobrescrever uma subscrição PAGA ativa (Stripe/cripto) com um trial manual.
  if (!opts.force && ativa && existing?.source && existing.source !== "manual") {
    return { ok: false, error: `Este utilizador já tem uma subscrição paga ativa (${existing.source}). Não foi alterada.` };
  }

  if (opts.onlyIfPending) {
    if (ativa && existing?.source === "manual") {
      const ate = existing.current_period_end
        ? ` até ${new Date(existing.current_period_end as string).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" })}`
        : "";
      return { ok: false, jaTratado: true, error: `Já tratado: já tem um plano de tester ativo${ate}.` };
    }
    // Reclama a inscrição de forma atómica: de dois cliques (ou de um clique e
    // uma reentrega) ao mesmo tempo, só um encontra a linha ainda pendente.
    const { data: reclamada, error: claimErr } = await admin
      .from("beta_signups")
      .update({ status: "activated" })
      .eq("email", email)
      .eq("status", "pending")
      .select("email");
    if (claimErr) return { ok: false, error: "Base de dados indisponível, tenta de novo." };
    if (!reclamada || reclamada.length === 0) {
      const { data: linhas } = await admin.from("beta_signups").select("status").eq("email", email).limit(1);
      const estado = (linhas?.[0] as { status?: string } | undefined)?.status;
      return { ok: false, jaTratado: true, error: `Já tratado: inscrição ${estado ? `em estado "${estado}"` : "inexistente"}.` };
    }
  }

  const end = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const price_id = plan === "premium" ? premiumPriceId || "manual_premium" : "manual_pro";

  const { error } = await admin.from("subscriptions").upsert(
    { user_id: userId, status: "active", price_id, current_period_end: end.toISOString(), cancel_at_period_end: false, source: "manual" },
    { onConflict: "user_id" },
  );
  if (error) {
    if (opts.onlyIfPending) {
      // Devolve a inscrição a pendente, para o botão poder voltar a ser usado.
      try {
        await admin.from("beta_signups").update({ status: "pending" }).eq("email", email).eq("status", "activated");
      } catch { /* fica ativada sem plano: visível no painel */ }
    }
    return { ok: false, error: error.message };
  }

  if (!opts.onlyIfPending) {
    try {
      await admin.from("beta_signups").update({ status: "activated" }).eq("email", email).eq("status", "pending");
    } catch { /* tabela pode não existir */ }
  }

  return { ok: true, until: end.toISOString() };
}
