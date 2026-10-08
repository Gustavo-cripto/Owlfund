// Webhook do @ChainFolioAi_Bot — trata os cliques nos botões "Ativar Pro/Premium",
// "Dispensar" e "Fundador" das notificações de beta.
//
// Quem pode carregar: os ids de UTILIZADOR em TELEGRAM_ADMIN_USER_IDS (lista
// separada por vírgulas); sem ela, o TELEGRAM_CHAT_ID, que num chat privado com
// o bot é o próprio id do admin. Se os avisos passarem para um grupo, é preciso
// definir TELEGRAM_ADMIN_USER_IDS. O clique tem ainda de vir de uma mensagem do
// chat configurado. As regras estão em src/lib/notify/telegramRegras.ts (testadas).
import { NextRequest, NextResponse } from "next/server";
import { grantTester } from "@/lib/beta/grant";
import { dispensarInscricao } from "@/lib/beta/dispensar";
import { setFounder } from "@/lib/beta/founder";
import { tgEsc } from "@/lib/notify/telegram";
import { tgCall, webhookSecret } from "@/lib/notify/telegramWebhook";
import { cliqueAutorizado, configAdmin, lerCallback, segredoConfere } from "@/lib/notify/telegramRegras";

const TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
const ADMIN = configAdmin(process.env.TELEGRAM_ADMIN_USER_IDS, process.env.TELEGRAM_CHAT_ID);

// Os três helpers usam o tgCall: timeout de 8 s (sem ele, uma API pendurada
// prendia a função até ao limite da Vercel e o Telegram reentregava o clique)
// e registo no log de qualquer falha (antes engolia-se tudo).
async function answerCb(id: string, text: string, alert = false) {
  await tgCall(TOKEN, "answerCallbackQuery", { callback_query_id: id, text: text.slice(0, 200), show_alert: alert });
}

async function sendMsg(chatId: number, text: string) {
  await tgCall(TOKEN, "sendMessage", { chat_id: chatId, text: text.slice(0, 4000), parse_mode: "HTML", disable_web_page_preview: true });
}

async function markDone(chatId: number, messageId: number, label: string) {
  const r = await tgCall(TOKEN, "editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [[{ text: label.slice(0, 64), callback_data: "done" }]] },
  });
  // Se falhar, os botões originais ficam ativos — o tgCall já o registou; o
  // grantTester com onlyIfPending impede que um segundo toque repita a ação.
  return r.tipo === "ok";
}

// Segredo do webhook: derivado do token do bot (que so nos e o Telegram
// conhecemos), para nao exigir mais uma env var. O Telegram devolve-o em cada
// pedido no cabecalho X-Telegram-Bot-Api-Secret-Token — e a unica prova de que
// o pedido vem mesmo do Telegram. Ate aqui bastava conhecer o id numerico do
// chat do admin para forjar um clique e ativar Premium a quem se quisesse.
const WEBHOOK_SECRET = TOKEN ? webhookSecret(TOKEN) : "";

type CallbackQuery = {
  id: string;
  data?: string;
  from?: { id?: number };
  message?: { message_id: number; chat: { id: number } };
};

export async function POST(req: NextRequest) {
  if (!segredoConfere(req.headers.get("x-telegram-bot-api-secret-token"), WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let update: { callback_query?: CallbackQuery } = {};
  try {
    update = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const cq = update.callback_query;
  if (!cq) return NextResponse.json({ ok: true }); // ignora mensagens normais

  // Responde SEMPRE 200 ao Telegram: um erro aqui faria-o reentregar o clique
  // e repetir a ação.
  try {
    await tratarClique(cq);
  } catch (e) {
    console.error("[telegram-webhook]", e instanceof Error ? e.message : e);
    await answerCb(cq.id, "⚠️ Erro interno. Tenta de novo daqui a pouco.", true);
  }
  return NextResponse.json({ ok: true });
}

async function tratarClique(cq: CallbackQuery) {
  if (!cliqueAutorizado({ fromId: cq.from?.id, chatId: cq.message?.chat.id }, ADMIN)) {
    await answerCb(cq.id, "Não autorizado.");
    return;
  }

  const acao = lerCallback(cq.data);
  if (!acao) {
    await answerCb(cq.id, "Ação inválida.");
    return;
  }
  const chatId = cq.message?.chat.id;

  if (acao.tipo === "feito") {
    await answerCb(cq.id, "Já tratado.");
    return;
  }

  // 🏆 Confirmar reserva de preço de fundador (botão nas mensagens do cron).
  if (acao.tipo === "fundador") {
    const res = await setFounder(acao.userId);
    if (!res.ok) {
      await answerCb(cq.id, `⚠️ ${res.error ?? "Falhou."}`, true);
      return;
    }
    const email = res.email ?? "";
    await answerCb(cq.id, `🏆 Fundador confirmado: ${email}`, true);
    if (cq.message) await markDone(cq.message.chat.id, cq.message.message_id, `🏆 Fundador: ${email}`);
    if (chatId) {
      await sendMsg(
        chatId,
        `🏆 <b>Preço de fundador reservado!</b>\n📧 ${tgEsc(email)}\n💶 Pro €9,99/mês ou €99/ano · Premium €19/mês ou €190/ano (vitalício)\n\n` +
          `O tester vê a reserva na página de planos. O preço de fundador aplica-se no pagamento com cartão (Stripe) quando os pagamentos abrirem; no pagamento em cripto ainda não é automático.`,
      );
    }
    return;
  }

  // 🚫 Dispensar a inscrição: tira-a da lista de pendentes do painel.
  // Não apaga contas nem mexe em planos (ver src/lib/beta/dispensar.ts).
  if (acao.tipo === "dispensar") {
    const res = await dispensarInscricao(acao.email);
    if (!res.ok) {
      await answerCb(cq.id, `⚠️ ${res.error ?? "Falhou."}`, true);
      return;
    }
    await answerCb(cq.id, `🚫 Inscrição de ${acao.email} dispensada.`, true);
    if (cq.message) await markDone(cq.message.chat.id, cq.message.message_id, `🚫 Dispensada — ${acao.email}`);
    return;
  }

  // ✅ Ativar o tester. onlyIfPending: um segundo toque num botão antigo ou uma
  // reentrega do Telegram não reinicia os 60 dias nem reativa quem foi
  // dispensado ou já terminou o beta.
  const { plano, email } = acao;
  const res = await grantTester(email, plano, { onlyIfPending: true });
  if (!res.ok) {
    await answerCb(cq.id, `${res.jaTratado ? "ℹ️" : "⚠️"} ${res.error ?? "Falhou."}`, true);
    return;
  }

  const label = plano === "premium" ? "Premium" : "Pro";
  const untilStr = res.until
    ? new Date(res.until).toLocaleDateString("pt-PT", { day: "2-digit", month: "long", year: "numeric" })
    : "60 dias";

  // 1) popup de confirmação ao tocar
  await answerCb(cq.id, `✅ ${email} ativado com ${label} (60 dias)!`, true);
  // 2) marca a mensagem original como tratada
  if (cq.message) await markDone(cq.message.chat.id, cq.message.message_id, `✅ Ativado: ${label} — ${email}`);
  // 3) mensagem de confirmação persistente no chat
  if (chatId) {
    await sendMsg(
      chatId,
      `✅ <b>Tester ativado!</b>\n📧 ${tgEsc(email)}\n💎 Plano: <b>${label}</b>\n⏳ 60 dias (até ${tgEsc(untilStr)})\n\nO tester deve recarregar a página.`,
    );
  }
}
