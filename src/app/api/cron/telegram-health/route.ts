import { NextResponse } from "next/server";
import { rateLimitPublic } from "@/lib/api/requireUser";
import { REPLY_TO, sendEmail, esc } from "@/lib/email";
import { sendTelegram, tgEsc } from "@/lib/notify/telegram";
import { checkAndHeal } from "@/lib/notify/telegramWebhook";

// Mantem o bot de admin sempre a funcionar: verifica o registo do webhook no
// Telegram e, se estiver desalinhado, volta a registar-o (ver
// src/lib/notify/telegramWebhook.ts).
//
// Chamado de hora a hora pelo GitHub Actions (.github/workflows/bot-telegram.yml)
// e uma vez por dia pelo cron da Vercel, como reserva.
//
// Sem segredo, de proposito: e o que deixa o GitHub chamar isto sem guardar
// credenciais la. E seguro porque so faz uma coisa — levar a configuracao
// para o estado certo, de forma idempotente — e so devolve booleanos. Limite
// por IP para ninguem o usar para martelar a API do Telegram.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Avisos (Telegram/email) no maximo uma vez por 6 h por instancia: o endpoint
// e publico e um erro persistente nao pode virar uma enxurrada de emails.
let ultimoAviso = 0;
const podeAvisar = () => { const ok = Date.now() - ultimoAviso > 6 * 3_600_000; if (ok) ultimoAviso = Date.now(); return ok; };

export async function GET(request: Request) {
  const limitado = rateLimitPublic(request, "telegram-health", 6);
  if (limitado) return limitado;

  const r = await checkAndHeal();

  if (r.healed && podeAvisar()) {
    // Se o webhook estava mal, o envio de mensagens continua a funcionar
    // (nao depende do webhook) — o Telegram e o sitio certo para avisar.
    await sendTelegram(`🔧 <b>Bot de administração reparado automaticamente</b>\nMotivo: ${tgEsc(r.reason ?? "?")}\nOs botões voltaram a funcionar normalmente.`).catch(() => false);
  } else if (!r.ok && r.error && podeAvisar()) {
    // Nao conseguiu reparar: o Telegram pode ser exatamente o que esta
    // partido, por isso o aviso vai por email.
    await sendEmail({
      to: REPLY_TO,
      subject: "⚠️ Bot do Telegram em baixo — não foi possível reparar",
      html: `<p>A verificação automática do bot de admin falhou.</p><p><b>Motivo:</b> ${esc(r.reason ?? "—")}<br><b>Erro:</b> ${esc(r.error)}</p><p>Abre chainfolioai.com/admin/beta e carrega em <b>Reconfigurar bot</b>. Se der erro, o token na Vercel (TELEGRAM_BOT_TOKEN) pode estar errado.</p>`,
      unsubscribe: false,
      tag: "telegram-health",
    }).catch(() => false);
  }

  // Nunca devolve o url nem mensagens do Telegram: so o estado.
  return NextResponse.json(
    { ok: r.ok, healed: r.healed, ...(r.reason ? { reason: r.reason.split(":")[0].split(" (")[0] } : {}) },
    // Erro transitorio (timeout do lado do Telegram) nao falha o job: so falha
    // quando nao ha maneira de reparar.
    { status: r.ok || !r.error ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
