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
// Versão texto (multipart) — emails só-HTML pesam no score de spam.
const toText = (h: string) =>
  h
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|tr|div|table)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export async function GET(request: Request) {
  if (!(await verifyCronAuth(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const now = new Date();
  const OFFER_DAY = 10; // dia 50 do trial: oferta de fundador (faltam 10 dias)
  const horizon = new Date(now.getTime() + (OFFER_DAY + 1) * DAY);

  const { data: subs, error } = await admin
    .from("subscriptions")
    .select("user_id, price_id, current_period_end")
    .eq("source", "manual")
    .eq("status", "active")
    .gt("current_period_end", now.toISOString())
    .lte("current_period_end", horizon.toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Cron diário → 1 aviso por marco exato.
  const mapped = (subs ?? []).map((s) => {
    const end = s.current_period_end ? new Date(s.current_period_end as string) : null;
    const daysLeft = end ? Math.ceil((end.getTime() - now.getTime()) / DAY) : null;
    return { ...s, end, daysLeft };
  });
  const due = mapped.filter((s) => s.daysLeft != null && NOTIFY_DAYS.includes(s.daysLeft));
  const offerDue = mapped.filter((s) => s.daysLeft === OFFER_DAY);

  // (sem retorno antecipado: além dos avisos ao admin há emails ao tester,
  //  fim de beta e alerta de inatividade)

  const items: string[] = [];
  const tgLines: string[] = [];
  const testerMails: { to: string; subject: string; html: string }[] = [];
  const shell = (inner: string) => `<div style="background:#0f172a;padding:24px;font-family:-apple-system,Helvetica,Arial,sans-serif"><div style="max-width:560px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:14px;overflow:hidden"><div style="padding:16px 22px;border-bottom:1px solid #1f2937;color:#fff;font-weight:800">ChainFolio<span style="color:#f97316">AI</span></div><div style="padding:20px 22px;color:#cbd5e1;font-size:14px;line-height:1.6">${inner}</div></div></div>`;
  const BOT = '<a href="https://t.me/ChainFolioAiBetaBot" style="color:#38bdf8;font-weight:700">@ChainFolioAiBetaBot</a>';
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
    // Email ao PRÓPRIO tester no marco dos 3 dias (1 vez).
    if (s.daysLeft === 3 && em) {
      testerMails.push({
        to: em,
        subject: "O teu acesso beta ChainFolioAI termina em 3 dias ⏳",
        html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Faltam 3 dias de ${plan} 🚀</p>
          <p>O teu período de beta tester termina a <b>${esc(endStr)}</b>. Depois disso a conta volta ao plano Free — os teus dados ficam todos guardados.</p>
          <p style="background:#1f2937;border-radius:10px;padding:12px 14px">🙏 <b>Antes de acabar, conta-nos como correu:</b> o que gostaste, o que faltou, o que partirias. Fala connosco no Telegram: ${BOT}</p>
          <p style="color:#94a3b8;font-size:12px">Como beta tester, terás condições especiais no lançamento. Ficas na lista. 💛</p>`),
      });
    }
  }

  // ── Dia 50: oferta de FUNDADOR ao tester (pagamentos ativam no lançamento) ──
  for (const sub of offerDue) {
    let em = "";
    try {
      const { data } = await admin.auth.admin.getUserById(sub.user_id as string);
      em = data.user?.email ?? "";
    } catch { /* ignore */ }
    if (!em) continue;
    const plan = premiumPriceId && sub.price_id === premiumPriceId ? "Premium" : "Pro";
    testerMails.push({
      to: em,
      subject: "O teu preço de fundador ChainFolioAI está reservado 🏆",
      html: shell(`<p style="color:#fff;font-size:17px;font-weight:700">Estás connosco desde o início — isso conta. 🏆</p>
        <p>Faltam ~10 dias para o fim do teu período beta (${plan}). Como <b>fundador</b>, garantimos-te para sempre:</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin:6px 0">
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Premium Fundador</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">€19/mês</b> <span style="color:#64748b;text-decoration:line-through">€39</span></td></tr>
          <tr><td colspan="2" style="height:6px"></td></tr>
          <tr><td style="padding:8px 10px;background:#1f2937;border-radius:8px 0 0 8px;color:#fff"><b>Pro Fundador</b></td><td style="padding:8px 10px;background:#1f2937;text-align:right"><b style="color:#fb923c">€9,99/mês</b> <span style="color:#64748b;text-decoration:line-through">€14,99</span></td></tr>
        </table>
        <p style="color:#94a3b8;font-size:13px">Preço <b>vitalício</b> enquanto mantiveres a subscrição — mesmo quando os preços subirem. O pagamento só abre no lançamento; até lá não pagas nada.</p>
        <p style="background:#0c4a6e33;border:1px solid #0ea5e955;border-radius:10px;padding:12px 14px">👉 <b>Para reservar o teu preço de fundador</b>, responde no Telegram: <a href="https://t.me/ChainFolioAiBetaBot" style="color:#38bdf8;font-weight:700">@ChainFolioAiBetaBot</a> — e aproveita para nos dizeres o que gostaste e o que faltou (o teu balanço vale ouro 🙏).</p>`),
    });
    await sendTelegram(`🏆 Oferta de fundador enviada a ${tgEsc(em)} (${plan}, faltam 10 dias)\nQuando o tester responder no bot a reservar, confirma aqui:`, {
      inline_keyboard: [[{ text: "🏆 Confirmar fundador", callback_data: `f:${sub.user_id}` }]],
    }).catch(() => {});
  }

  // Alerta no Bot ChainFolioAI (Telegram), se configurado. await obrigatório
  // (serverless aborta envios não aguardados após a resposta).
  if (due.length > 0) await sendTelegram(`⏰ <b>Beta — ${due.length} tester(s) a expirar</b>\n(avisos a 3 e 1 dia)\n\n${tgLines.join("\n")}`).catch(() => {});

  const key = process.env.RESEND_API_KEY ?? "";
  if (key && due.length > 0) {
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
      await resend.emails.send({ from: FROM, to: TO, subject: `⏰ Beta: ${due.length} tester(s) a expirar (3/1 dia)`, html, text: toText(html) });
    } catch { /* não falhar o cron por causa do email */ }
  }

  // ── Fim de beta: expirou nas últimas 24h → obrigado + balanço final ──────
  let ended = 0;
  try {
    const { data: endedSubs } = await admin
      .from("subscriptions")
      .select("user_id, price_id, current_period_end")
      .eq("source", "manual")
      .eq("status", "active")
      .gt("current_period_end", new Date(now.getTime() - DAY).toISOString())
      .lte("current_period_end", now.toISOString());
    for (const sub of endedSubs ?? []) {
      let em = "";
      try {
        const { data } = await admin.auth.admin.getUserById(sub.user_id as string);
        em = data.user?.email ?? "";
      } catch { /* ignore */ }
      if (!em) continue;
      ended++;
      testerMails.push({
        to: em,
        subject: "Obrigado por testares o ChainFolioAI 💛",
        html: shell(`<p style="color:#fff;font-size:16px;font-weight:700">Os teus 60 dias de beta terminaram — obrigado! 🙏</p>
          <p>A tua conta voltou ao plano <b>Free</b>: os teus dados, carteiras e histórico ficam todos guardados e podes continuar a usar o site e a app.</p>
          <p style="background:#1f2937;border-radius:10px;padding:12px 14px">📝 <b>Último pedido:</b> um balanço final em 2 minutos — o que valeu a pena, o que faltou? Responde no Telegram: ${BOT}</p>
          <p style="background:#3b271433;border:1px solid #f9731655;border-radius:10px;padding:12px 14px">🏆 O teu <b>preço de fundador</b> fica garantido: <b>Premium €19/mês</b> (em vez de €39) ou <b>Pro €9,99/mês</b> (em vez de €14,99) — vitalício enquanto fores subscritor. Reserva respondendo no Telegram: <a href="https://t.me/ChainFolioAiBetaBot" style="color:#38bdf8;font-weight:700">@ChainFolioAiBetaBot</a>. Avisamos-te em primeira mão quando o pagamento abrir.</p>`),
      });
      await sendTelegram(`🏁 <b>Beta terminou</b>: ${tgEsc(em)} — email de balanço final enviado.\nSe reservar o preço de fundador, confirma aqui:`, {
        inline_keyboard: [[{ text: "🏆 Confirmar fundador", callback_data: `f:${sub.user_id}` }]],
      }).catch(() => {});
    }
  } catch { /* ignore */ }

  // ── Inatividade: 14 dias exatos sem login → alerta 1x no Telegram ─────────
  let inactive = 0;
  try {
    const { data: allManual } = await admin
      .from("subscriptions")
      .select("user_id, current_period_end")
      .eq("source", "manual")
      .eq("status", "active")
      .gt("current_period_end", now.toISOString());
    const lines: string[] = [];
    for (const sub of allManual ?? []) {
      try {
        const { data } = await admin.auth.admin.getUserById(sub.user_id as string);
        const last = data.user?.last_sign_in_at ? new Date(data.user.last_sign_in_at as string) : null;
        const days = last ? Math.floor((now.getTime() - last.getTime()) / DAY) : null;
        if (days === 14) {
          lines.push(`😴 ${tgEsc(data.user?.email ?? "?")} — 14 dias sem entrar`);
          inactive++;
        }
      } catch { /* ignore */ }
    }
    if (lines.length > 0) {
      await sendTelegram(`⚠️ <b>Testers inativos (14d sem login)</b>\n${lines.join("\n")}\nVale a pena um toque pessoal?`).catch(() => {});
    }
  } catch { /* ignore */ }

  // ── Envia os emails aos testers ───────────────────────────────────────────
  if (key && testerMails.length > 0) {
    const resend = new Resend(key);
    for (const m of testerMails) {
      try {
        await resend.emails.send({ from: FROM, to: m.to, subject: m.subject, html: m.html, text: toText(m.html) });
      } catch { /* não falhar o cron */ }
    }
  }

  return NextResponse.json({ ok: true, notified: due.length, testerMails: testerMails.length, ended, inactiveAlerts: inactive, at: now.toISOString() });
}
