// Acolher uma conta acabada de criar (16 out 2026, decisão do dono):
//   1. durante o beta, com os pagamentos desligados, o Premium de 60 dias liga-se
//      SOZINHO — antes era preciso pedir em /beta "com o mesmo email" e esperar
//      que alguém ativasse à mão (uma inscrição ficou 14 dias pendente e a pessoa
//      nunca criou conta);
//   2. a conta aparece no /admin/beta como tester (subscrição manual) e fica uma
//      linha "activated" em beta_signups, como as ativações à mão;
//   3. aviso no Telegram do dono, sem botões (já está ativo);
//   4. boas-vindas por email a dizer que o Premium já está ativo.
//
// Corre uma vez por conta (notification_log, kind "conta_nova"), a partir do
// registo por palavra-passe (/api/auth/boas-vindas), da ligação mágica
// (/api/auth/confirm), do Google (/api/auth/callback) e da carteira (o
// formulário chama a mesma rota). Nunca lança: entrar nunca falha por isto.

import type { SupabaseClient } from "@supabase/supabase-js";
import { markSent } from "@/lib/email";
import { primeiroAvisoDoDia, travaoDeContas } from "@/lib/beta/travaoContas";
import { enviarBoasVindas } from "@/lib/emails/boasVindas";
import { BETA_CUTOFF_ISO, betaAberto } from "@/lib/plans";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";
import { origemDoCookie } from "@/lib/origem";
import { langFromMetadata, resolveLang } from "@/lib/user/lang";

const TRIAL_DAYS = 60; // o mesmo de src/lib/beta/grant.ts
const JANELA_MS = 3 * 86_400_000;
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";

type Conta = { id: string; email?: string | null; created_at?: string | null; user_metadata?: Record<string, unknown> | null; app_metadata?: Record<string, unknown> | null };

/** O Premium automático só existe durante o beta e com os pagamentos desligados. */
export function premiumAutomatico(): boolean {
  return betaAberto() && process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== "true";
}

/** Liga o Premium de 60 dias pelo id da conta, sem nunca tocar numa subscrição paga ativa. */
async function ligarPremium(admin: SupabaseClient, userId: string): Promise<Date | null> {
  const { data: atual } = await admin.from("subscriptions").select("status, source, current_period_end").eq("user_id", userId).maybeSingle();
  const ativa = !!atual && atual.status === "active" && (!atual.current_period_end || new Date(atual.current_period_end as string).getTime() > Date.now());
  if (ativa) return null; // já tem plano (pago ou de tester): não se mexe
  // Pelo menos 60 dias e, com os pagamentos desligados, até ao fim do beta:
  // quem entrasse a 20 out perdia o Premium a 19 dez sem ter como pagar (20 out 2026).
  const fimBeta = new Date(BETA_CUTOFF_ISO).getTime();
  const fim = new Date(Math.max(Date.now() + TRIAL_DAYS * 86_400_000, Number.isFinite(fimBeta) ? fimBeta : 0));
  const { error } = await admin.from("subscriptions").upsert(
    { user_id: userId, status: "active", price_id: premiumPriceId || "manual_premium", current_period_end: fim.toISOString(), cancel_at_period_end: false, source: "manual" },
    { onConflict: "user_id" },
  );
  if (error) { console.error("[conta-nova] subscrição:", error.message); return null; }
  return fim;
}

export async function acolherContaNova(admin: SupabaseClient, conta: Conta | null | undefined, opts: { cookie?: string | null; ip?: string | null } = {}): Promise<void> {
  try {
    if (!conta?.id || !conta.created_at) return;
    if (Date.now() - Date.parse(conta.created_at) > JANELA_MS) return;
    const email = (conta.email ?? "").trim().toLowerCase();
    // Contas do teste noturno (e2e/conta-nova.spec.ts): nem Premium, nem Telegram, nem email.
    if (/\+e2e[^@]*@/i.test(email)) return;
    // O travão corre ANTES do registo de "acolhida": esse registo gasta a única
    // passagem, e quem batesse no teto nunca mais recebia o Premium. Por isso quem
    // já foi acolhido sai antes de contar: cada entrada nos 3 dias passa por aqui.
    const { data: registo } = await admin.from("notification_log").select("user_id").eq("user_id", conta.id).eq("kind", "conta_nova").maybeSingle();
    if (!registo) {
      const travao = await travaoDeContas(admin, opts.ip);
      if (travao !== "ok") {
        console.warn("[conta-nova] travão:", travao);
        if (await primeiroAvisoDoDia(admin, travao)) {
          await sendTelegram(
            `🛑 <b>Travão das contas novas</b>\nHoje ${travao === "ip" ? "um mesmo IP" : "o total do dia"} passou o teto: as contas seguintes ficam em Free, sem Premium, sem email e sem aviso.\n` +
              "Pode ser abuso. Se for gente real, ativa-as em /admin/beta ou sobe CONTAS_NOVAS_POR_IP_DIA / CONTAS_NOVAS_POR_DIA na Vercel. Este aviso só sai uma vez por dia.",
          ).catch(() => false);
        }
        return;
      }
    }
    // Uma vez por conta, mesmo com dois pedidos ao mesmo tempo.
    if (!(await markSent(admin, conta.id, "conta_nova", false))) {
      // Já acolhida: as boas-vindas têm o seu próprio registo (não duplicam).
      await enviarBoasVindas(admin, conta);
      return;
    }

    const premiumAte = premiumAutomatico() ? await ligarPremium(admin, conta.id) : null;
    const lang = resolveLang(langFromMetadata(conta.user_metadata));
    if (premiumAte && email) {
      // Fica no /admin/beta como as ativações à mão; o cron do beta trata dos
      // emails seguintes (inatividade, aviso de fim, oferta de fundador).
      try {
        const { data: ja } = await admin.from("beta_signups").select("id").eq("email", email).limit(1);
        if ((ja ?? []).length) await admin.from("beta_signups").update({ status: "activated" }).eq("email", email);
        else await admin.from("beta_signups").insert({ email, note: "[automático] conta nova", lang, status: "activated" });
      } catch (e) { console.error("[conta-nova] beta_signups:", e instanceof Error ? e.message : e); }
      // O "primeiro passo" do dia seguinte repetia estas boas-vindas.
      await markSent(admin, conta.id, "welcome_step1", false);
    }

    // Telegram do dono.
    const via = String(conta.app_metadata?.provider ?? "email");
    const src = (conta.user_metadata?.src as string | undefined) ?? (opts.cookie ? origemDoCookie(opts.cookie) : "");
    await sendTelegram(
      `🎉 <b>Nova conta</b>\n📧 ${email ? tgEsc(email) : "(carteira, sem email)"}\n🔑 ${tgEsc(via)}` +
        (src ? `\n📣 via ${tgEsc(src)}` : "") +
        (premiumAte ? `\n✅ Premium ativado automaticamente até ${premiumAte.toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" })}` : ""),
    ).catch(() => false);

    if (email) await enviarBoasVindas(admin, conta, { premiumAte });
  } catch (e) {
    console.error("[conta-nova]", e instanceof Error ? e.message : e);
  }
}
