// Envio de notificações para o Bot do Telegram do ChainFolioAI.
// Gated nas envs TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID — sem elas, no-op (silencioso).
// Token: criar via @BotFather. chat_id: o teu chat/grupo (ex.: via @userinfobot).
export async function sendTelegram(text: string, replyMarkup?: unknown): Promise<boolean> {
  const token = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID ?? "").trim();
  if (!token || !chatId) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.slice(0, 4000),
        parse_mode: "HTML",
        disable_web_page_preview: true,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      // Antes engolia-se o motivo; sem ele ninguem sabia se era token, chat_id ou rede.
      const desc = await res.json().then((j: { description?: string }) => j.description).catch(() => undefined);
      ultimoErro = `${res.status}${desc ? ` ${desc}` : ""}`;
      console.error("[telegram] sendMessage falhou:", ultimoErro);
    }
    return res.ok;
  } catch (e) {
    ultimoErro = e instanceof Error ? e.message : String(e);
    console.error("[telegram] sendMessage:", ultimoErro);
    return false;
  }
}

let ultimoErro: string | null = null;
/** Motivo da ultima falha de envio nesta instancia (para o botao "Testar aviso" do painel). */
export function ultimoErroTelegram(): string | null { return ultimoErro; }

/** Escapa texto para o parse_mode HTML do Telegram. */
export function tgEsc(x: string): string {
  return x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
