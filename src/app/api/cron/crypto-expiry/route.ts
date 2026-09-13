import { NextResponse } from "next/server";
import { internalError } from "@/lib/api/response";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { FROM_BILLING, fmtDate, markSent, sendEmail } from "@/lib/email";
import type { Lang } from "@/lib/i18n/translations";
import { langFromMetadata, resolveLang, signupLangByEmail } from "@/lib/user/lang";

// Vercel Cron Job (diário, 00:30 UTC — ver vercel.json). CRON_SECRET obrigatório.
//
// Faz duas coisas, só sobre linhas source='crypto' (as do Stripe são geridas pelos
// webhooks):
//  1) AVISOS de renovação por email a T-7 e T-1 dias do fim do período (Resend).
//  2) EXPIRAÇÃO: quando o período pago termina, devolve o utilizador ao plano Free
//     (status='canceled'). NUNCA toca em dados do utilizador (carteiras, snapshots,
//     histórico, métricas) — só na linha da subscrição. Ao renovar, tudo volta igual.
//
// Modelo: tudo pré-pago + renovação MANUAL (igual p/ BTC/ETH/SOL). Não há débito
// automático — daí os avisos. Como o cron corre 1×/dia, o match exato de dias
// (7 e 1) dispara cada aviso uma única vez, sem precisar de coluna de dedupe.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_DAYS = [7, 1];

function planFromPriceId(priceId: string | null | undefined): "Premium" | "Pro" {
  const premium =
    process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";
  return premium && priceId === premium ? "Premium" : "Pro";
}

// Na lingua do cliente (user_metadata.lang → beta_signups.lang → pt).
const R: Record<Lang, { subject: (plan: string, when: string) => string; when: (d: number) => string; p1: (plan: string, end: string) => string; p2: string; cta: string; foot: string }> = {
  pt: {
    subject: (plan, when) => `A tua subscrição ${plan} expira ${when}`,
    when: (d) => (d <= 1 ? "amanhã" : `em ${d} dias`),
    p1: (plan, end) => `O acesso pago em cripto termina a <strong>${end}</strong>. Como os pagamentos em cripto não têm débito automático, precisas de renovar manualmente para manteres o ${plan}.`,
    p2: "O teu histórico de portefólio e todas as métricas ficam <strong>intactos</strong> — renovar apenas reativa o acesso, sem perder nada.",
    cta: "Renovar agora", foot: "ChainFolioAI · pagamento em EURC/USDC, direto para a tua carteira.",
  },
  en: {
    subject: (plan, when) => `Your ${plan} subscription expires ${when}`,
    when: (d) => (d <= 1 ? "tomorrow" : `in ${d} days`),
    p1: (plan, end) => `Your crypto-paid access ends on <strong>${end}</strong>. Crypto payments have no automatic debit, so you need to renew manually to keep ${plan}.`,
    p2: "Your portfolio history and all metrics stay <strong>intact</strong> — renewing only reactivates access, nothing is lost.",
    cta: "Renew now", foot: "ChainFolioAI · payment in EURC/USDC, straight to your wallet.",
  },
  es: {
    subject: (plan, when) => `Tu suscripción ${plan} expira ${when}`,
    when: (d) => (d <= 1 ? "mañana" : `en ${d} días`),
    p1: (plan, end) => `El acceso pagado en cripto termina el <strong>${end}</strong>. Como los pagos en cripto no tienen cargo automático, necesitas renovar manualmente para mantener ${plan}.`,
    p2: "Tu historial de cartera y todas las métricas quedan <strong>intactos</strong> — renovar solo reactiva el acceso, sin perder nada.",
    cta: "Renovar ahora", foot: "ChainFolioAI · pago en EURC/USDC, directo a tu monedero.",
  },
  fr: {
    subject: (plan, when) => `Votre abonnement ${plan} expire ${when}`,
    when: (d) => (d <= 1 ? "demain" : `dans ${d} jours`),
    p1: (plan, end) => `Votre accès payé en crypto se termine le <strong>${end}</strong>. Les paiements en crypto n'ont pas de prélèvement automatique : il faut renouveler manuellement pour garder ${plan}.`,
    p2: "Votre historique de portefeuille et toutes vos métriques restent <strong>intacts</strong> — renouveler ne fait que réactiver l'accès, rien n'est perdu.",
    cta: "Renouveler maintenant", foot: "ChainFolioAI · paiement en EURC/USDC, directement vers votre portefeuille.",
  },
};

function reminderHtml(lang: Lang, plan: string, endLabel: string, days: number, accountUrl: string): string {
  const r = R[lang];
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <h2 style="color:#ea580c;margin:0 0 12px">${r.subject(plan, r.when(days))}</h2>
    <p style="line-height:1.6;margin:0 0 12px">${r.p1(plan, endLabel)}</p>
    <p style="line-height:1.6;margin:0 0 20px">${r.p2}</p>
    <p style="margin:0 0 24px">
      <a href="${accountUrl}" style="background:#ea580c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9999px;font-weight:600">${r.cta}</a>
    </p>
    <p style="font-size:12px;color:#64748b;margin:0">${r.foot}</p>
  </div>`;
}

export async function GET(request: Request) {
  if (!(await verifyCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();

  // ── 1) Avisos de renovação (T-7 / T-1) ──────────────────────────────────
  let reminded = 0;
  const remindErrors: string[] = [];
  const resendKey = process.env.RESEND_API_KEY ?? "";
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com").replace(/\/$/, "");

  if (resendKey) {
    try {
      const horizonIso = new Date(now.getTime() + 8 * DAY_MS).toISOString();
      const { data: upcoming } = await admin
        .from("subscriptions")
        .select("user_id, current_period_end, price_id")
        .eq("source", "crypto")
        .eq("status", "active")
        .gt("current_period_end", nowIso)
        .lt("current_period_end", horizonIso);

      if (upcoming && upcoming.length > 0) {
        const signupLang = await signupLangByEmail(admin);
        for (const sub of upcoming) {
          const end = sub.current_period_end ? new Date(sub.current_period_end) : null;
          if (!end) continue;
          const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY_MS);
          // Marcos ≤7 e ≤1 dia, cada um enviado UMA vez (notification_log); com a
          // tabela em falta cai no match exato de antes.
          const kind = daysLeft <= 1 ? `crypto_1d:${end.toISOString().slice(0, 10)}` : daysLeft <= 7 ? `crypto_7d:${end.toISOString().slice(0, 10)}` : null;
          if (!kind) continue;
          if (!(await markSent(admin, sub.user_id, kind, REMINDER_DAYS.includes(daysLeft)))) continue;

          const { data: u } = await admin.auth.admin.getUserById(sub.user_id);
          const email = u?.user?.email;
          if (!email) continue;

          const plan = planFromPriceId(sub.price_id);
          const lang = resolveLang(langFromMetadata(u?.user?.user_metadata), signupLang.get(email.toLowerCase()));
          const endLabel = fmtDate(end, lang, { day: "2-digit", month: "2-digit", year: "numeric" });
          const ok = await sendEmail({
            from: FROM_BILLING,
            to: email,
            subject: R[lang].subject(plan, R[lang].when(daysLeft)),
            html: reminderHtml(lang, plan, endLabel, daysLeft, `${siteUrl}/account`),
            tag: "crypto_reminder",
          });
          if (ok) reminded++; else remindErrors.push(email);
        }
      }
    } catch (e) {
      // Falha nos avisos não deve impedir a expiração abaixo.
      remindErrors.push(e instanceof Error ? e.message : "reminder error");
    }
  }

  // ── 2) Expiração → volta a Free (só a linha da subscrição) ───────────────
  const { data, error } = await admin
    .from("subscriptions")
    .update({ status: "canceled" })
    .eq("source", "crypto")
    .eq("status", "active")
    .lt("current_period_end", nowIso)
    .select("user_id");

  if (error) {
    console.error("[cron/crypto-expiry]", error.message);
    return internalError(error, { reminded });
  }

  return NextResponse.json({
    expired: data?.length ?? 0,
    reminded,
    remindErrors: remindErrors.length ? remindErrors : undefined,
    at: nowIso,
  });
}
