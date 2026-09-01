// Inscrição de beta testers. Envia:
//  1) notificação para o ChainFolioAI (suporte@) para libertar Pro/Premium;
//  2) email de boas-vindas (marketing) para o próprio tester, no idioma dele.
import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const TO = process.env.BETA_SIGNUP_TO ?? "suporte@chainfolioai.com";
const FROM = "ChainFolioAI <noreply@chainfolioai.com>";
const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com";
const TRIAL_DAYS = 60;

// Data de corte do beta: a partir dela não se aceitam NOVOS testers. Os que já
// têm plano mantêm os dias que faltam até expirar (depois renovam/pagam).
// Definir em NEXT_PUBLIC_BETA_CUTOFF (ISO, ex.: "2026-10-01"). Vazio = sempre aberto.
function betaClosed(): boolean {
  const raw = process.env.NEXT_PUBLIC_BETA_CUTOFF ?? "2026-11-05T23:59:59Z";
  if (!raw) return false;
  const d = new Date(raw);
  return !Number.isNaN(d.getTime()) && Date.now() > d.getTime();
}

const hits = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 5;
const WINDOW = 60_000;
function allowed(ip: string): boolean {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now > e.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW });
    return true;
  }
  if (e.count >= LIMIT) return false;
  e.count++;
  return true;
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n).trim() : "");
const isEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Molde de email com a marca (fundo escuro, acento laranja).
function shell(inner: string): string {
  return `<div style="background:#0f172a;padding:28px;font-family:-apple-system,Helvetica,Arial,sans-serif">
    <div style="max-width:520px;margin:0 auto;background:#111827;border:1px solid #1f2937;border-radius:16px;overflow:hidden">
      <div style="padding:18px 24px;border-bottom:1px solid #1f2937">
        <span style="color:#fff;font-weight:800;font-size:18px;letter-spacing:.3px">ChainFolio<span style="color:#f97316">AI</span></span>
      </div>
      <div style="padding:24px;color:#cbd5e1;font-size:14px;line-height:1.6">${inner}</div>
      <div style="padding:14px 24px;border-top:1px solid #1f2937;color:#64748b;font-size:11px">
        ChainFolioAI · <a href="${SITE}" style="color:#fb923c;text-decoration:none">chainfolioai.com</a>
      </div>
    </div>
  </div>`;
}

// Boas-vindas ao tester, por idioma (curto e com marketing).
function welcome(lang: string, name: string, untilStr: string): { subject: string; html: string } {
  const hi = name ? `, ${esc(name)}` : "";
  const T: Record<string, { subject: string; body: string }> = {
    en: {
      subject: "Welcome to the ChainFolioAI beta 🎉",
      body: `<p style="color:#fff;font-size:17px;font-weight:700">You're on the list${hi}! 🎉</p>
        <p>Thanks for joining the <b>ChainFolioAI</b> beta — the dashboard that brings your <b>crypto and traditional assets</b> together, with real-time PNL, tax tools and an AI that knows your real portfolio.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">✅ You'll get <b>Pro or Premium free for ${TRIAL_DAYS} days</b> once we activate your account (indicative until <b>${untilStr}</b>).</p>
        <p><b>Next step:</b> create your account so we can unlock your plan.</p>
        <p><a href="${SITE}/login" style="display:inline-block;background:#f97316;color:#0f172a;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px">Create my account →</a></p>
        <p style="color:#94a3b8;font-size:12px">100% read-only and non-custodial — we never ask for private keys.</p>`,
    },
    es: {
      subject: "Bienvenido a la beta de ChainFolioAI 🎉",
      body: `<p style="color:#fff;font-size:17px;font-weight:700">¡Estás en la lista${hi}! 🎉</p>
        <p>Gracias por unirte a la beta de <b>ChainFolioAI</b> — el panel que reúne tu <b>cripto y activos tradicionales</b>, con PNL en tiempo real, impuestos y una IA que conoce tu cartera real.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">✅ Tendrás <b>Pro o Premium gratis ${TRIAL_DAYS} días</b> cuando activemos tu cuenta (indicativo hasta el <b>${untilStr}</b>).</p>
        <p><b>Siguiente paso:</b> crea tu cuenta para poder liberar tu plan.</p>
        <p><a href="${SITE}/login" style="display:inline-block;background:#f97316;color:#0f172a;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px">Crear mi cuenta →</a></p>
        <p style="color:#94a3b8;font-size:12px">100% de solo lectura y sin custodia — nunca pedimos claves privadas.</p>`,
    },
    fr: {
      subject: "Bienvenue dans la bêta de ChainFolioAI 🎉",
      body: `<p style="color:#fff;font-size:17px;font-weight:700">Vous êtes sur la liste${hi} ! 🎉</p>
        <p>Merci de rejoindre la bêta de <b>ChainFolioAI</b> — le tableau de bord qui réunit vos <b>cryptos et actifs traditionnels</b>, avec PNL en temps réel, fiscalité et une IA qui connaît votre portefeuille réel.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">✅ Vous aurez <b>Pro ou Premium gratuit ${TRIAL_DAYS} jours</b> dès l'activation de votre compte (indicatif jusqu'au <b>${untilStr}</b>).</p>
        <p><b>Étape suivante :</b> créez votre compte pour que nous puissions débloquer votre plan.</p>
        <p><a href="${SITE}/login" style="display:inline-block;background:#f97316;color:#0f172a;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px">Créer mon compte →</a></p>
        <p style="color:#94a3b8;font-size:12px">100% en lecture seule et sans conservation — nous ne demandons jamais de clés privées.</p>`,
    },
    pt: {
      subject: "Bem-vindo ao beta do ChainFolioAI 🎉",
      body: `<p style="color:#fff;font-size:17px;font-weight:700">Estás na lista${hi}! 🎉</p>
        <p>Obrigado por entrares no beta do <b>ChainFolioAI</b> — o painel que junta a tua <b>cripto e ativos tradicionais</b>, com PNL em tempo real, fiscalidade e uma IA que conhece o teu portefólio real.</p>
        <p style="background:#1f2937;border-radius:10px;padding:12px 14px">✅ Vais ter <b>Pro ou Premium grátis durante ${TRIAL_DAYS} dias</b> assim que ativarmos a tua conta (indicativo até <b>${untilStr}</b>).</p>
        <p><b>Próximo passo:</b> cria a tua conta para podermos libertar o teu plano.</p>
        <p><a href="${SITE}/login" style="display:inline-block;background:#f97316;color:#0f172a;font-weight:700;text-decoration:none;padding:11px 20px;border-radius:10px">Criar a minha conta →</a></p>
        <p style="color:#94a3b8;font-size:12px">100% só-leitura e sem custódia — nunca pedimos chaves privadas.</p>`,
    },
  };
  const chosen = T[lang] ?? T.pt;
  return { subject: chosen.subject, html: shell(chosen.body) };
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allowed(ip)) return NextResponse.json({ error: "Demasiados pedidos. Tenta daqui a pouco." }, { status: 429 });
  if (betaClosed()) return NextResponse.json({ error: "beta_closed" }, { status: 403 });

  const key = process.env.RESEND_API_KEY ?? "";
  if (!key) return NextResponse.json({ error: "Email não configurado." }, { status: 503 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const email = str(body.email, 120);
  const name = str(body.name, 80);
  const note = str(body.note, 1000);
  const lang = (str(body.lang, 5) || "pt").toLowerCase();
  // Origem (?src=twitter) — só letras/números/traços, p/ atribuição por rede.
  const src = str(body.src, 40).replace(/[^a-zA-Z0-9_-]/g, "");
  if (!isEmail(email)) return NextResponse.json({ error: "Email inválido." }, { status: 400 });

  const until = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const untilStr = until.toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" });

  const resend = new Resend(key);

  // 1) Notificação para o ChainFolioAI (para libertar o plano).
  const notify = shell(`
    <p style="color:#fff;font-size:17px;font-weight:700">Novo beta tester 🎉</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <tr><td style="padding:6px 0;color:#94a3b8;width:120px">Email</td><td style="padding:6px 0;color:#fff"><b>${esc(email)}</b></td></tr>
      ${name ? `<tr><td style="padding:6px 0;color:#94a3b8">Nome</td><td style="padding:6px 0;color:#e2e8f0">${esc(name)}</td></tr>` : ""}
      ${note ? `<tr><td style="padding:6px 0;color:#94a3b8;vertical-align:top">Nota</td><td style="padding:6px 0;color:#e2e8f0">${esc(note)}</td></tr>` : ""}
      <tr><td style="padding:6px 0;color:#94a3b8">Idioma</td><td style="padding:6px 0;color:#e2e8f0">${esc(lang)}</td></tr>
      ${src ? `<tr><td style="padding:6px 0;color:#94a3b8">Origem</td><td style="padding:6px 0;color:#fb923c;font-weight:700">${esc(src)}</td></tr>` : ""}
      <tr><td style="padding:6px 0;color:#94a3b8">Validade</td><td style="padding:6px 0;color:#e2e8f0">${TRIAL_DAYS} dias após ativação (indicativo até ${untilStr})</td></tr>
    </table>
    <p style="background:#1f2937;border-radius:10px;padding:12px 14px;color:#e2e8f0">▶ <b>Para ativar:</b> abre o <a href="${SITE}/admin/beta?email=${encodeURIComponent(email)}" style="color:#fb923c;font-weight:700">painel de ativação</a> e clica em Ativar Pro/Premium (${TRIAL_DAYS} dias). Depois o tester recarrega.</p>
    <p style="color:#64748b;font-size:12px">IP: ${esc(ip)} · ${new Date().toISOString()}</p>
  `);

  try {
    await resend.emails.send({ from: FROM, to: TO, replyTo: email, subject: `🎉 Beta tester: ${email}`, html: notify });
    // 2) Boas-vindas ao tester (não bloqueia se falhar).
    const w = welcome(lang, name, untilStr);
    resend.emails.send({ from: FROM, to: email, subject: w.subject, html: w.html }).catch(() => {});
  } catch {
    return NextResponse.json({ error: "Falha ao enviar." }, { status: 502 });
  }

  // Guarda a inscrição para aparecer no painel (best-effort; ignora se a tabela
  // ainda não existir).
  try {
    const noteDb = [src ? `[via ${src}]` : "", note].filter(Boolean).join(" ") || null;
    await getSupabaseAdmin().from("beta_signups").insert({ email, name: name || null, note: noteDb, lang, ip });
  } catch { /* ignore */ }

  // 3) Notificação no Bot ChainFolioAI (Telegram), se configurado.
  // IMPORTANTE: await — em serverless, sem await o envio é abortado quando a
  // função devolve a resposta.
  // Botões one-tap (callback_data tem limite de 64 bytes → só se o email couber).
  const canButtons = `g:premium:${email}`.length <= 64;
  const replyMarkup = canButtons
    ? {
        inline_keyboard: [[
          { text: "✅ Ativar Pro", callback_data: `g:pro:${email}` },
          { text: "✅ Ativar Premium", callback_data: `g:premium:${email}` },
        ]],
      }
    : undefined;
  await sendTelegram(
    `🎉 <b>Novo beta tester</b>\n📧 ${tgEsc(email)}` +
      (name ? `\n👤 ${tgEsc(name)}` : "") +
      (note ? `\n📝 ${tgEsc(note)}` : "") +
      (src ? `\n📣 via ${tgEsc(src)}` : "") +
      `\n\n${canButtons ? "Toca num botão para ativar (60 dias) 👇" : `▶ <a href="${SITE}/admin/beta?email=${encodeURIComponent(email)}">Ativar no painel</a> (Pro/Premium · ${TRIAL_DAYS} dias)`}`,
    replyMarkup,
  ).catch(() => {});

  return NextResponse.json({ ok: true });
}
