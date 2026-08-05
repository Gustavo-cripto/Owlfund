// Vercel Cron (diário — ver vercel.json). Avisa o admin a ~3 dias E ~1 dia antes
// de um beta tester (atribuição manual) expirar, para decidires renovar ou deixar
// expirar (margem para agir). Alerta por email (Resend) para BETA_SIGNUP_TO.
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";

const TO = process.env.BETA_SIGNUP_TO ?? "suporte@chainfolioai.com";
const FROM = "ChainFolioAI <noreply@chainfolioai.com>";
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";
const DAY = 86_400_000;
const NOTIFY_DAYS = [3, 1]; // marcos de aviso (dias antes de expirar)
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function GET(request: Request) {
  if (!(await verifyCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const horizon = new Date(now.getTime() + (Math.max(...NOTIFY_DAYS) + 1) * DAY);

  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("user_id, price_id, current_period_end")
    .eq("source", "manual")
    .eq("status", "active")
    .gt("current_period_end", now.toISOString())
    .lte("current_period_end", horizon.toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Só os que estão exatamente a 3 ou 1 dia (cron diário → 1 aviso por marco).
  const due = (subs ?? [])
    .map((s) => {
      const end = s.current_period_end ? new Date(s.current_period_end as string) : null;
      const daysLeft = end ? Math.ceil((end.getTime() - now.getTime()) / DAY) : null;
      return { ...s, end, daysLeft };
    })
    .filter((s) => s.daysLeft != null && NOTIFY_DAYS.includes(s.daysLeft));

  if (due.length === 0) return NextResponse.json({ ok: true, notified: 0, at: now.toISOString() });

  const items: string[] = [];
  const tgLines: string[] = [];
  for (const s of due) {
    let em = "";
    try {
      const { data } = await admin.auth.admin.getUserById(s.user_id as string);
      em = data.user?.email ?? "";
    } catch { /* ignore */ }
    const plan = premiumPriceId && s.price_id === premiumPriceId ? "Premium" : "Pro";
    const endStr = s.end ? s.end.toLocaleString("pt-PT") : "?";
    const dl = s.daysLeft === 1 ? "1 dia" : `${s.daysLeft} dias`;
    const warn = s.daysLeft === 1 ? "color:#f87171;font-weight:700" : "color:#fbbf24";
    items.push(`<tr><td style="padding:6px 10px;color:#fff">${esc(em || "?")}</td><td style="padding:6px 10px;color:#e2e8f0">${plan}</td><td style="padding:6px 10px;${warn}">${dl}</td><td style="padding:6px 10px;color:#94a3b8">${endStr}</td></tr>`);
    tgLines.push(`${s.daysLeft === 1 ? "🔴" : "🟡"} ${tgEsc(em || "?")} · ${plan} · faltam ${dl}`);
  }

  // Alerta no Bot ChainFolioAI (Telegram), se configurado. await obrigatório
  // (serverless aborta envios não aguardados após a resposta).
  await sendTelegram(`⏰ <b>Beta — ${due.length} tester(s) a expirar</b>\n(avisos a 3 e 1 dia)\n\n${tgLines.join("\n")}`).catch(() => {});

  const key = process.env.RESEND_API_KEY ?? "";
  if (key) {
    const html = `<div style="background:#0f172a;padding:24px;font-family:-apple-system,Helvetica,Arial,sans-serif">
      <div style="max-width:600px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:14px;overflow:hidden">
        <div style="padding:16px 22px;border-bottom:1px solid #1f2937;color:#fff;font-weight:800">ChainFolio<span style="color:#f97316">AI</span> · Beta</div>
        <div style="padding:20px 22px;color:#cbd5e1;font-size:14px">
          <p style="color:#fff;font-size:16px;font-weight:700">⏰ ${due.length} tester(s) a expirar em breve</p>
          <p>Avisos a 3 e a 1 dia — tens margem para decidires <b>renovar</b> (estender no Supabase) ou deixar voltar ao Free.</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
            <tr style="background:#1f2937;color:#94a3b8;text-align:left"><th style="padding:6px 10px">Email</th><th style="padding:6px 10px">Plano</th><th style="padding:6px 10px">Faltam</th><th style="padding:6px 10px">Expira</th></tr>
            ${items.join("")}
          </table>
          <p style="color:#64748b;font-size:12px;margin-top:12px">Estender: <code>UPDATE public.subscriptions SET current_period_end = current_period_end + interval '30 days' WHERE source='manual' AND user_id = (SELECT id FROM auth.users WHERE email='...');</code></p>
        </div>
      </div>
    </div>`;
    try {
      const resend = new Resend(key);
      await resend.emails.send({ from: FROM, to: TO, subject: `⏰ Beta: ${due.length} tester(s) a expirar (3/1 dia)`, html });
    } catch { /* não falhar o cron por causa do email */ }
  }

  return NextResponse.json({ ok: true, notified: due.length, at: now.toISOString() });
}
