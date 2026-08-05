// Webhook do @ChainFolioAi_Bot — trata os cliques nos botões "Ativar Pro/Premium"
// das notificações de beta. Só aceita cliques do chat do admin (TELEGRAM_CHAT_ID).
import { NextRequest, NextResponse } from "next/server";
import { grantTester } from "@/lib/beta/grant";

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
const ADMIN_CHAT = (process.env.TELEGRAM_CHAT_ID ?? "").trim();

async function answerCb(id: string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: id, text, show_alert: false }),
    });
  } catch { /* ignore */ }
}

async function markDone(chatId: number, messageId: number, label: string) {
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [[{ text: label, callback_data: "done" }]] },
      }),
    });
  } catch { /* ignore */ }
}

export async function POST(req: NextRequest) {
  let update: {
    callback_query?: {
      id: string;
      data?: string;
      from?: { id?: number };
      message?: { message_id: number; chat: { id: number } };
    };
  } = {};
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const cq = update.callback_query;
  if (!cq) return NextResponse.json({ ok: true }); // ignora mensagens normais

  // Só o admin (o chat que configurámos) pode ativar.
  if (!ADMIN_CHAT || String(cq.from?.id ?? "") !== ADMIN_CHAT) {
    await answerCb(cq.id, "Não autorizado.");
    return NextResponse.json({ ok: true });
  }

  const m = String(cq.data ?? "").match(/^g:(pro|premium):(.+)$/);
  if (!m) {
    await answerCb(cq.id, "Ação inválida.");
    return NextResponse.json({ ok: true });
  }
  const plan = m[1] as "pro" | "premium";
  const email = m[2];

  const res = await grantTester(email, plan);
  if (!res.ok) {
    await answerCb(cq.id, res.error ?? "Falhou.");
    return NextResponse.json({ ok: true });
  }

  const label = plan === "premium" ? "Premium" : "Pro";
  await answerCb(cq.id, `✅ ${email} ativado com ${label} (60 dias).`);
  if (cq.message) await markDone(cq.message.chat.id, cq.message.message_id, `✅ Ativado: ${label} — ${email}`);
  return NextResponse.json({ ok: true });
}
