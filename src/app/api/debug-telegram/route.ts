// TEMPORÁRIO — diagnóstico do Telegram a partir das env vars da Vercel.
// Não expõe o token (só comprimento/formato/prefixo) e devolve o erro real da API.
// REMOVER após diagnóstico.
import { NextResponse } from "next/server";

export async function GET() {
  const raw = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const token = raw.trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID ?? "").trim();

  const out: Record<string, unknown> = {
    tokenPresent: raw.length > 0,
    tokenLen: raw.length,
    tokenTrimmedLen: token.length,
    tokenHasWhitespace: raw !== token,
    tokenFormatOk: /^\d+:[A-Za-z0-9_-]{30,}$/.test(token),
    tokenPrefix: token.slice(0, 4), // "8623" (ok) ou "sk_l" (Stripe errado)
    chatIdPresent: chatId.length > 0,
    chatId,
  };

  if (token) {
    try {
      const me = await fetch(`https://api.telegram.org/bot${token}/getMe`).then((r) => r.json());
      out.getMe = me.ok ? { ok: true, username: me.result?.username } : { ok: false, code: me.error_code, error: me.description };
    } catch (e) {
      out.getMe = { ok: false, error: String(e) };
    }
    if (chatId) {
      try {
        const send = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: "🔍 debug-telegram (env da Vercel)" }),
        }).then((r) => r.json());
        out.send = send.ok ? { ok: true } : { ok: false, code: send.error_code, error: send.description };
      } catch (e) {
        out.send = { ok: false, error: String(e) };
      }
    }
  }

  return NextResponse.json(out);
}
