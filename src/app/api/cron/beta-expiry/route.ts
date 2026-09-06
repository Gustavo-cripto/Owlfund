// Vercel Cron (diário 08:00 UTC — ver vercel.json). Ciclo de vida do beta:
//  1) EXPIRA os testers manuais cujo período terminou (voltam ao Free) — antes
//     nada o fazia e o gating ignorava a data.
//  2) Email ao tester a ≤3 dias, oferta de fundador a ≤10 dias, "obrigado" no fim,
//     alerta ao admin (email + Telegram) e inatividade aos 14 dias.
//  Idempotente: cada marco é registado em notification_log (o cron pode correr
//  2× e um dia falhado é apanhado no seguinte). Idioma do tester lido de
//  beta_signups (pt/en; es/fr caem em en).
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyCronAuth } from "@/lib/api/cron-auth";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";
import { esc, fmtDate, markSent, sendEmail, shell, TZ } from "@/lib/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TO = process.env.BETA_SIGNUP_TO ?? "suporte@chainfolioai.com";
const premiumPriceId = process.env.STRIPE_PREMIUM_PRICE_ID ?? process.env.NEXT_PUBLIC_STRIPE_PREMIUM_PRICE_ID ?? "";
const DAY = 86_400_000;
const OFFER_DAY = 10; // dia 50 do trial: oferta de fundador (faltam ≤10 dias)
const BOT = '<a href="https://t.me/ChainFolioAiBetaBot" style="color:#38bdf8;font-weight:700">@ChainFolioAiBetaBot</a>';

type Lang = "pt" | "en";
const pick = (lang: string): Lang => (lang === "pt" ? "pt" : "en");

const COPY = {
  d3: {
    pt: (plan: string, end: string) => ({
      subject: "O teu acesso beta ChainFolioAI termina em 3 dias",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Faltam 3 dias de ${plan} 🚀</p>
        <p>O teu período de beta tester termina a <b>${esc(end)}</b>. Depois disso a conta volta ao plano Free — os teus dados ficam todos guardados.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">🙏 <b>Antes de acabar, conta-nos como correu:</b> o que gostaste, o que faltou, o que mudarias. Fala connosco no Telegram: ${BOT}</p>
        <p style="color:#94a3b8;font-size:12px">Como beta tester, tens condições especiais no lançamento. Ficas na lista. 💛</p>`),
    }),
    en: (plan: string, end: string) => ({
      subject: "Your ChainFolioAI beta access ends in 3 days",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">3 days of ${plan} left 🚀</p>
        <p>Your beta tester period ends on <b>${esc(end)}</b>. After that the account goes back to the Free plan — all your data stays saved.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">🙏 <b>Before it ends, tell us how it went:</b> what you liked, what was missing, what you'd change. Talk to us on Telegram: ${BOT}</p>
        <p style="color:#94a3b8;font-size:12px">As a beta tester you get special conditions at launch. You're on the list. 💛</p>`),
    }),
  },
  offer: {
    pt: (plan: string) => ({
      subject: "O teu preço de fundador ChainFolioAI está reservado",
      html: shell(`<p style="color:#fff;font-size:17px;font-weight:700">Estás connosco desde o início — isso conta. 🏆</p>
        <p>Faltam cerca de 10 dias para o fim do teu período beta (${plan}). Como <b>fundador</b>, garantimos-te para sempre:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:6px 0">
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Premium Fundador</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">€19/mês</b> <span style="color:#64748b;text-decoration:line-through">€39</span></td></tr>
          <tr><td colspan="2" style="height:6px"></td></tr>
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Pro Fundador</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">€9,99/mês</b> <span style="color:#64748b;text-decoration:line-through">€14,99</span></td></tr>
        </table>
        <p style="color:#94a3b8;font-size:13px">Preço <b>vitalício</b> enquanto mantiveres a subscrição — mesmo quando os preços subirem. O pagamento só abre no lançamento; até lá não pagas nada.</p>
        <p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">👉 <b>Para reservar o teu preço de fundador</b>, responde no Telegram: ${BOT} — e aproveita para nos dizeres o que gostaste e o que faltou (o teu balanço vale ouro 🙏).</p>`),
    }),
    en: (plan: string) => ({
      subject: "Your ChainFolioAI founder price is reserved",
      html: shell(`<p style="color:#fff;font-size:17px;font-weight:700">You've been with us from the start — that counts. 🏆</p>
        <p>About 10 days left of your beta period (${plan}). As a <b>founder</b>, we guarantee you for life:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:6px 0">
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Founder Premium</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">€19/month</b> <span style="color:#64748b;text-decoration:line-through">€39</span></td></tr>
          <tr><td colspan="2" style="height:6px"></td></tr>
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Founder Pro</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">€9.99/month</b> <span style="color:#64748b;text-decoration:line-through">€14.99</span></td></tr>
        </table>
        <p style="color:#94a3b8;font-size:13px"><b>Lifetime</b> price as long as you keep the subscription — even when prices go up. Payments only open at launch; until then you pay nothing.</p>
        <p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">👉 <b>To reserve your founder price</b>, reply on Telegram: ${BOT} — and tell us what you liked and what was missing (your feedback is gold 🙏).</p>`),
    }),
  },
  ended: {
    pt: () => ({
      subject: "Obrigado por testares o ChainFolioAI",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Os teus 60 dias de beta terminaram — obrigado! 🙏</p>
        <p>A tua conta voltou ao plano <b>Free</b>: os teus dados, carteiras e histórico ficam todos guardados e podes continuar a usar o site.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">📝 <b>Último pedido:</b> um balanço final em 2 minutos — o que valeu a pena, o que faltou? Responde no Telegram: ${BOT}</p>
        <p style="background:#3b271433;border:1px solid #f9731655;border-radius:10px;padding:12px 14px">🏆 O teu <b>preço de fundador</b> fica garantido: <b>Premium €19/mês</b> (em vez de €39) ou <b>Pro €9,99/mês</b> (em vez de €14,99) — vitalício enquanto fores subscritor. Reserva respondendo no Telegram: ${BOT}. Avisamos-te em primeira mão quando o pagamento abrir.</p>`),
    }),
    en: () => ({
      subject: "Thank you for testing ChainFolioAI",
      html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Your 60 beta days are over — thank you! 🙏</p>
        <p>Your account is back on the <b>Free</b> plan: your data, wallets and history are all kept and you can keep using the site.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">📝 <b>One last ask:</b> a 2-minute final review — what was worth it, what was missing? Reply on Telegram: ${BOT}</p>
        <p style="background:#3b271433;border:1px solid #f9731655;border-radius:10px;padding:12px 14px">🏆 Your <b>founder price</b> is guaranteed: <b>Premium €19/month</b> (instead of €39) or <b>Pro €9.99/month</b> (instead of €14.99) — for life while you subscribe. Reserve it by replying on Telegram: ${BOT}. You'll be the first to know when payments open.</p>`),
    }),
  },
};

export async function GET(request: Request) {
  if (!(await verifyCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const nowIso = now.toISOString();

  // ── 0) Expirar testers manuais cujo período terminou → Free ───────────────
  let expired = 0;
  try {
    const { data } = await admin
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("source", "manual")
      .eq("status", "active")
      .lt("current_period_end", nowIso)
      .select("user_id");
    expired = data?.length ?? 0;
  } catch (e) { console.error("[beta-expiry] expirar", e instanceof Error ? e.message : e); }

  // Mapa id → {email, lastSignIn} numa única listagem (antes: 1 pedido por tester, todos os dias).
  const users = new Map<string, { email: string; lastSignIn: string | null }>();
  try {
    for (let page = 1; page <= 5; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      for (const u of data.users) users.set(u.id, { email: u.email ?? "", lastSignIn: (u.last_sign_in_at as string | undefined) ?? null });
      if (data.users.length < 1000) break;
    }
  } catch (e) { console.error("[beta-expiry] listUsers", e instanceof Error ? e.message : e); }

  // Idioma por email (beta_signups.lang) — best-effort.
  const langByEmail = new Map<string, string>();
  try {
    const { data } = await admin.from("beta_signups").select("email, lang");
    for (const r of data ?? []) if (r.email) langByEmail.set(String(r.email).toLowerCase(), String(r.lang ?? "pt"));
  } catch { /* tabela opcional */ }
  const langOf = (email: string): Lang => pick(langByEmail.get(email.toLowerCase()) ?? "pt");
  const planOf = (priceId: unknown) => (premiumPriceId && priceId === premiumPriceId ? "Premium" : "Pro");

  // ── 1) Ativos a terminar nos próximos 11 dias ─────────────────────────────
  const horizon = new Date(now.getTime() + (OFFER_DAY + 1) * DAY);
  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("user_id, price_id, current_period_end")
    .eq("source", "manual")
    .eq("status", "active")
    .gt("current_period_end", nowIso)
    .lte("current_period_end", horizon.toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const adminRows: string[] = [];
  const tgLines: string[] = [];
  let testerMails = 0;
  let offers = 0;

  for (const s of subs ?? []) {
    const uid = s.user_id as string;
    const end = s.current_period_end ? new Date(s.current_period_end as string) : null;
    if (!end) continue;
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / DAY);
    const u = users.get(uid);
    const em = u?.email ?? "";
    const plan = planOf(s.price_id);
    const lang = em ? langOf(em) : "pt";
    const endStr = fmtDate(end, lang, { day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

    // Oferta de fundador (≤10 dias, uma vez).
    if (daysLeft <= OFFER_DAY && daysLeft > 3 && em && (await markSent(admin, uid, "founder_offer", daysLeft === OFFER_DAY))) {
      const m = COPY.offer[lang](plan);
      if (await sendEmail({ to: em, subject: m.subject, html: m.html, tag: "founder_offer" })) { offers++; testerMails++; }
      await sendTelegram(`🏆 Oferta de fundador enviada a ${tgEsc(em)} (${plan}, faltam ${daysLeft} dias)\nQuando o tester responder no bot a reservar, confirma aqui:`, {
        inline_keyboard: [[{ text: "🏆 Confirmar fundador", callback_data: `f:${uid}` }]],
      }).catch(() => {});
    }

    // Aviso ao tester (≤3 dias, uma vez) + linha para o admin.
    if (daysLeft <= 3) {
      if (em && (await markSent(admin, uid, "beta_3d", daysLeft === 3))) {
        const m = COPY.d3[lang](plan, endStr);
        if (await sendEmail({ to: em, subject: m.subject, html: m.html, tag: "beta_3d" })) testerMails++;
      }
      const kind = daysLeft <= 1 ? "admin_1d" : "admin_3d";
      if (await markSent(admin, uid, kind, daysLeft === (daysLeft <= 1 ? 1 : 3))) {
        const dl = daysLeft <= 1 ? "1 dia" : `${daysLeft} dias`;
        const warn = daysLeft <= 1 ? "color:#f87171;font-weight:700" : "color:#fbbf24";
        adminRows.push(`<tr><td style="padding:6px 10px;color:#fff">${esc(em || uid)}</td><td style="padding:6px 10px;color:#e2e8f0">${plan}</td><td style="padding:6px 10px;${warn}">${dl}</td><td style="padding:6px 10px;color:#94a3b8">${esc(end.toLocaleString("pt-PT", { timeZone: TZ }))}</td></tr>`);
        tgLines.push(`${daysLeft <= 1 ? "🔴" : "🟡"} ${tgEsc(em || uid)} · ${plan} · faltam ${dl}`);
      }
    }
  }

  if (tgLines.length > 0) {
    await sendTelegram(`⏰ <b>Beta — ${tgLines.length} tester(s) a expirar</b>\n(avisos a 3 e 1 dia)\n\n${tgLines.join("\n")}`).catch(() => {});
    const html = shell(`<p style="color:#fff;font-size:16px;font-weight:700">⏰ ${tgLines.length} tester(s) a expirar em breve</p>
      <p>Avisos a 3 e a 1 dia — tens margem para decidires <b>renovar</b> (estender no Supabase) ou deixar voltar ao Free.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
        <tr style="background:#1f2937;color:#94a3b8;text-align:left"><th style="padding:6px 10px">Email</th><th style="padding:6px 10px">Plano</th><th style="padding:6px 10px">Faltam</th><th style="padding:6px 10px">Expira</th></tr>
        ${adminRows.join("")}
      </table>
      <p style="color:#64748b;font-size:12px;margin-top:12px">Estender: <code>UPDATE public.subscriptions SET current_period_end = current_period_end + interval '30 days' WHERE source='manual' AND user_id = (SELECT id FROM auth.users WHERE email='...');</code></p>`, { title: "Beta" });
    await sendEmail({ to: TO, subject: `Beta: ${tgLines.length} tester(s) a expirar (3/1 dia)`, html, unsubscribe: false, tag: "admin_expiry" });
  }

  // ── 2) Fim de beta: terminou nas últimas 48 h (já cancelado acima) → obrigado ──
  let ended = 0;
  try {
    const { data: endedSubs } = await admin
      .from("subscriptions")
      .select("user_id, price_id, current_period_end")
      .eq("source", "manual")
      .in("status", ["canceled", "active"])
      .gt("current_period_end", new Date(now.getTime() - 2 * DAY).toISOString())
      .lte("current_period_end", nowIso);
    for (const sub of endedSubs ?? []) {
      const uid = sub.user_id as string;
      const em = users.get(uid)?.email ?? "";
      if (!em) continue;
      if (!(await markSent(admin, uid, "beta_ended", true))) continue;
      const m = COPY.ended[langOf(em)]();
      if (await sendEmail({ to: em, subject: m.subject, html: m.html, tag: "beta_ended" })) { ended++; testerMails++; }
      await sendTelegram(`🏁 <b>Beta terminou</b>: ${tgEsc(em)} — voltou ao Free; email de balanço final enviado.\nSe reservar o preço de fundador, confirma aqui:`, {
        inline_keyboard: [[{ text: "🏆 Confirmar fundador", callback_data: `f:${uid}` }]],
      }).catch(() => {});
    }
  } catch (e) { console.error("[beta-expiry] fim", e instanceof Error ? e.message : e); }

  // ── 3) Inatividade: ≥14 dias sem login → alerta 1x no Telegram ────────────
  let inactive = 0;
  try {
    const { data: allManual } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("source", "manual")
      .eq("status", "active")
      .gt("current_period_end", nowIso);
    const lines: string[] = [];
    for (const sub of allManual ?? []) {
      const uid = sub.user_id as string;
      const u = users.get(uid);
      const last = u?.lastSignIn ? new Date(u.lastSignIn) : null;
      const days = last ? Math.floor((now.getTime() - last.getTime()) / DAY) : null;
      if (days != null && days >= 14 && (await markSent(admin, uid, "inactive_14d", days === 14))) {
        lines.push(`😴 ${tgEsc(u?.email ?? uid)} — ${days} dias sem entrar`);
        inactive++;
      }
    }
    if (lines.length > 0) {
      await sendTelegram(`⚠️ <b>Testers inativos (≥14d sem login)</b>\n${lines.join("\n")}\nVale a pena um toque pessoal?`).catch(() => {});
    }
  } catch (e) { console.error("[beta-expiry] inatividade", e instanceof Error ? e.message : e); }

  return NextResponse.json({ ok: true, expired, notified: tgLines.length, testerMails, offers, ended, inactiveAlerts: inactive, at: nowIso });
}
