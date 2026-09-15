import { NextResponse } from "next/server";
import { rateLimitPublic } from "@/lib/api/requireUser";
import { FROM, REPLY_TO, esc, sendEmail } from "@/lib/email";
import { sendTelegram } from "@/lib/notify/telegram";

// Questionario de um passo para quem desistiu: "o que te fez parar?".
// Nao guarda nada na base de dados — a resposta vai EM BRUTO, palavra por
// palavra, para o suporte@ (que chega ao Gmail) e para o Telegram do admin.
// E a informacao mais barata que existe sobre o produto; o valor esta nas
// palavras exatas, nao num resumo.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REASONS = new Set(["next_step", "exchange", "load", "worth", "other_product", "other"]);
const LABEL: Record<string, string> = {
  next_step: "Não percebeu qual era o passo seguinte",
  exchange: "Faltava a corretora ou carteira que utiliza",
  load: "Algo não carregou ou apresentou um erro",
  worth: "Não considerou que valesse a pena",
  other_product: "Não era o que procurava",
  other: "Outro motivo",
};

export async function POST(request: Request) {
  // Publico e sem sessao (quem desistiu nao vai fazer login para dizer porque),
  // por isso limite por IP apertado + honeypot.
  const limitado = rateLimitPublic(request, "feedback", 5);
  if (limitado) return limitado;

  let b: { email?: unknown; reason?: unknown; text?: unknown; lang?: unknown; website?: unknown } = {};
  try { b = await request.json(); } catch { return NextResponse.json({ error: "bad_json" }, { status: 400 }); }
  if (typeof b.website === "string" && b.website.trim()) return NextResponse.json({ ok: true }); // bot: finge que aceitou

  const email = typeof b.email === "string" ? b.email.trim().toLowerCase().slice(0, 120) : "";
  const reason = typeof b.reason === "string" && REASONS.has(b.reason) ? b.reason : "";
  const text = typeof b.text === "string" ? b.text.trim().slice(0, 1000) : "";
  const lang = typeof b.lang === "string" ? b.lang.slice(0, 2) : "?";
  if (!reason && !text) return NextResponse.json({ error: "empty" }, { status: 400 });
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const quem = emailOk ? email : "(sem email)";
  const html =
    `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">` +
    `<p style="font-size:13px;color:#64748b;margin:0 0 12px">Resposta ao questionário de utilizador inativo · ${esc(quem)} · ${esc(lang)}</p>` +
    (reason ? `<p style="margin:0 0 10px"><b>Motivo:</b> ${esc(LABEL[reason] ?? reason)}</p>` : "") +
    (text ? `<p style="margin:0 0 4px"><b>Nas palavras do utilizador:</b></p><blockquote style="margin:0;padding:10px 14px;border-left:3px solid #f97316;background:#fff7ed;white-space:pre-wrap">${esc(text)}</blockquote>` : "") +
    `</div>`;
  const ok = await sendEmail({
    to: REPLY_TO, from: FROM,
    // Responder ao email de aviso responde diretamente a quem escreveu.
    replyTo: emailOk ? email : undefined,
    subject: `Feedback de tester: ${quem}`,
    html, unsubscribe: false, tag: "feedback",
  });
  // Telegram: a frase exata, sem resumo.
  void sendTelegram(`💬 <b>Feedback de tester</b>\n${esc(quem)} · ${esc(lang)}` + (reason ? `\n<b>Motivo:</b> ${esc(LABEL[reason] ?? reason)}` : "") + (text ? `\n<b>Diz:</b> ${esc(text)}` : "")).catch(() => {});
  return NextResponse.json({ ok });
}
