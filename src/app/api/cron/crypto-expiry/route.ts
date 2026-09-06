import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { FROM_BILLING, markSent, sendEmail, TZ } from "@/lib/email";

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

function reminderHtml(plan: string, endLabel: string, days: number, accountUrl: string): string {
  const when = days === 1 ? "amanhã" : `em ${days} dias`;
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#0f172a">
    <h2 style="color:#ea580c;margin:0 0 12px">A tua subscrição ${plan} expira ${when}</h2>
    <p style="line-height:1.6;margin:0 0 12px">
      O acesso pago em cripto termina a <strong>${endLabel}</strong>. Como os pagamentos em
      cripto não têm débito automático, precisas de renovar manualmente para manteres o ${plan}.
    </p>
    <p style="line-height:1.6;margin:0 0 20px">
      O teu histórico de portefólio e todas as métricas ficam <strong>intactos</strong> —
      renovar apenas reativa o acesso, sem perder nada.
    </p>
    <p style="margin:0 0 24px">
      <a href="${accountUrl}" style="background:#ea580c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9999px;font-weight:600">
        Renovar agora
      </a>
    </p>
    <p style="font-size:12px;color:#64748b;margin:0">ChainFolioAI · pagamento em EURC/USDC, direto para a tua carteira.</p>
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
          const endLabel = end.toLocaleDateString("pt-PT", { timeZone: TZ });
          const ok = await sendEmail({
            from: FROM_BILLING,
            to: email,
            subject: `A tua subscrição ${plan} expira ${daysLeft <= 1 ? "amanhã" : `em ${daysLeft} dias`}`,
            html: reminderHtml(plan, endLabel, daysLeft, `${siteUrl}/account`),
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
    return NextResponse.json({ error: error.message, reminded }, { status: 500 });
  }

  return NextResponse.json({
    expired: data?.length ?? 0,
    reminded,
    remindErrors: remindErrors.length ? remindErrors : undefined,
    at: nowIso,
  });
}
