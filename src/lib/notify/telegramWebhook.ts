import { createHash } from "node:crypto";
import { classificarResposta, diagnosticarWebhook, type ChamadaTelegram, type CorpoTelegram, type InfoWebhook } from "@/lib/notify/telegramRegras";

// Saude do webhook do bot de admin (@ChainFolioAiSocialBot — o bot cujo token
// esta em TELEGRAM_BOT_TOKEN). SO ESTE BOT: o @ChainFolioAiBetaBot e gerido
// pelo sistema do fundador e nunca pode ter webhook configurado pelo site.
//
// O bot nao tem servidor proprio que possa cair: o Telegram entrega cada
// clique ao site. O que o deita abaixo e a configuracao desalinhar — o webhook
// apagado ou apontado para outro sitio, ou o segredo mudar (e derivado do
// token: rodar o token muda-o). Foi o que aconteceu a 13 set 2026: o site
// passou a exigir o segredo e o Telegram ainda nao o conhecia → 401 em todos
// os botoes, sem ninguem saber. checkAndHeal() ve isso e volta a registar.

const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com").replace(/\/$/, "");
export const WEBHOOK_URL = `${SITE}/api/telegram-webhook`;

export function webhookSecret(token: string): string {
  return createHash("sha256").update(`tg-webhook:${token}`).digest("hex");
}

function botToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
}

/**
 * Chamada à API do Telegram com timeout de 8 s. Nunca lança: devolve se correu
 * bem, se foi uma falha transitória (rede, timeout, 5xx, 429, corpo que não é
 * JSON) ou se o Telegram recusou (token inválido, pedido errado). Regista no
 * log o motivo de qualquer falha — antes engolia-se e ninguém sabia porquê.
 */
export async function tgCall<T>(token: string, method: string, body?: unknown): Promise<ChamadaTelegram<T>> {
  let r: ChamadaTelegram<T>;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const corpo = (await res.json().catch(() => null)) as CorpoTelegram<T> | null;
    r = classificarResposta(res.status, corpo);
  } catch {
    r = classificarResposta<T>(null, null);
  }
  if (r.tipo !== "ok") console.error(`[telegram] ${method} ${r.tipo}: ${r.detalhe}`);
  return r;
}

const SEM_RESPOSTA = "Telegram sem resposta (transitório) — tenta de novo daqui a pouco.";

export type WebhookOp = { ok: boolean; bot?: string; error?: string; transitorio?: boolean };

/**
 * Regista o webhook com o segredo. `dropPending`: true quando e o admin a
 * reconfigurar a mao; false na reparacao automatica, para nao deitar fora
 * cliques que ainda estejam a espera de entrega.
 */
export async function registerWebhook(dropPending: boolean): Promise<WebhookOp> {
  const token = botToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN não está definido na Vercel." };
  const me = await tgCall<{ username?: string }>(token, "getMe");
  if (me.tipo === "transitorio") return { ok: false, transitorio: true, error: SEM_RESPOSTA };
  if (me.tipo === "recusado") return { ok: false, error: `Token inválido (getMe falhou: ${me.detalhe}).` };
  const bot = me.result?.username;
  const set = await tgCall(token, "setWebhook", {
    url: WEBHOOK_URL,
    allowed_updates: ["callback_query"],
    drop_pending_updates: dropPending,
    secret_token: webhookSecret(token),
  });
  if (set.tipo === "transitorio") return { ok: false, bot, transitorio: true, error: SEM_RESPOSTA };
  if (set.tipo === "recusado") return { ok: false, bot, error: set.detalhe || "Falha no setWebhook." };
  return { ok: true, bot };
}

export async function deleteWebhook(): Promise<WebhookOp> {
  const token = botToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN não está definido na Vercel." };
  const me = await tgCall<{ username?: string }>(token, "getMe");
  if (me.tipo === "transitorio") return { ok: false, transitorio: true, error: SEM_RESPOSTA };
  if (me.tipo === "recusado") return { ok: false, error: `Token inválido (getMe falhou: ${me.detalhe}).` };
  const bot = me.result?.username;
  const del = await tgCall(token, "deleteWebhook", { drop_pending_updates: true });
  if (del.tipo === "transitorio") return { ok: false, bot, transitorio: true, error: SEM_RESPOSTA };
  if (del.tipo === "recusado") return { ok: false, bot, error: del.detalhe || "Falha no deleteWebhook." };
  return { ok: true, bot };
}

export type HealthResult = {
  ok: boolean;
  /** true se estava mal e foi reparado nesta verificacao. */
  healed: boolean;
  /** Porque estava mal (vazio se estava bem). */
  reason?: string;
  pending?: number;
  /**
   * So quando e preciso alguem (token invalido, Telegram a recusar o registo).
   * Falhas transitorias (timeout, 5xx) nunca o preenchem: nao geram email nem
   * fazem falhar o job — a verificacao seguinte volta a tentar.
   */
  error?: string;
};

// Endpoint publico e chamado de fora: uma verificacao por meio minuto chega
// (o resto dos pedidos recebe o resultado anterior), para ninguem transformar
// isto num martelo contra a API do Telegram.
let ultima: { at: number; result: HealthResult } | null = null;

export async function checkAndHeal(): Promise<HealthResult> {
  if (ultima && Date.now() - ultima.at < 30_000) return ultima.result;
  const r = await checkAndHealNow();
  ultima = { at: Date.now(), result: r };
  return r;
}

const TRANSITORIO = "Telegram sem resposta (transitório)";

async function checkAndHealNow(): Promise<HealthResult> {
  const token = botToken();
  if (!token) return { ok: false, healed: false, error: "TELEGRAM_BOT_TOKEN não está definido na Vercel." };

  const r = await tgCall<InfoWebhook>(token, "getWebhookInfo");
  if (r.tipo === "transitorio") return { ok: false, healed: false, reason: TRANSITORIO };
  if (r.tipo === "recusado") return { ok: false, healed: false, error: `getWebhookInfo recusado (token inválido?): ${r.detalhe}` };
  const info = r.result;

  const { motivo, erroRecente } = diagnosticarWebhook(info, Math.floor(Date.now() / 1000), WEBHOOK_URL);
  const pending = info?.pending_update_count ?? 0;

  if (!motivo) {
    // Outros erros recentes (timeouts, 5xx) sao transitorios: o Telegram volta
    // a tentar sozinho. Reportam-se, mas nao se mexe no registo.
    return { ok: !erroRecente, healed: false, pending, ...(erroRecente ? { reason: `erro transitório recente: ${erroRecente}` } : {}) };
  }

  try {
    const fix = await registerWebhook(false);
    if (fix.ok) return { ok: true, healed: true, reason: motivo, pending };
    // Telegram sem resposta a meio da reparacao: a proxima verificacao repete.
    if (fix.transitorio) return { ok: false, healed: false, reason: `${motivo} (reparação adiada: ${TRANSITORIO})`, pending };
    return { ok: false, healed: false, reason: motivo, error: fix.error };
  } catch (e) {
    console.error("[telegram] reparação do webhook:", e instanceof Error ? e.message : e);
    return { ok: false, healed: false, reason: `${motivo} (reparação adiada: ${TRANSITORIO})`, pending };
  }
}
