import { createHash } from "node:crypto";

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

async function tg<T>(token: string, method: string, body?: unknown): Promise<{ ok: boolean; result?: T; description?: string }> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  return res.json();
}

/**
 * Regista o webhook com o segredo. `dropPending`: true quando e o admin a
 * reconfigurar a mao; false na reparacao automatica, para nao deitar fora
 * cliques que ainda estejam a espera de entrega.
 */
export async function registerWebhook(dropPending: boolean): Promise<{ ok: boolean; bot?: string; error?: string }> {
  const token = botToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN não está definido na Vercel." };
  const me = await tg<{ username?: string }>(token, "getMe");
  if (!me.ok) return { ok: false, error: "Token inválido (getMe falhou)." };
  const set = await tg(token, "setWebhook", {
    url: WEBHOOK_URL,
    allowed_updates: ["callback_query"],
    drop_pending_updates: dropPending,
    secret_token: webhookSecret(token),
  });
  if (!set.ok) return { ok: false, bot: me.result?.username, error: set.description || "Falha no setWebhook." };
  return { ok: true, bot: me.result?.username };
}

export async function deleteWebhook(): Promise<{ ok: boolean; bot?: string; error?: string }> {
  const token = botToken();
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN não está definido na Vercel." };
  const me = await tg<{ username?: string }>(token, "getMe");
  if (!me.ok) return { ok: false, error: "Token inválido (getMe falhou)." };
  const del = await tg(token, "deleteWebhook", { drop_pending_updates: true });
  if (!del.ok) return { ok: false, bot: me.result?.username, error: del.description || "Falha no deleteWebhook." };
  return { ok: true, bot: me.result?.username };
}

type WebhookInfo = {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  allowed_updates?: string[];
};

export type HealthResult = {
  ok: boolean;
  /** true se estava mal e foi reparado nesta verificacao. */
  healed: boolean;
  /** Porque estava mal (vazio se estava bem). */
  reason?: string;
  pending?: number;
  error?: string;
};

// Uma verificacao corre de hora a hora; um erro de autenticacao mais recente
// do que isto e novo (e nao o que ja se reparou na hora anterior).
const RECENT_S = 70 * 60;

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

async function checkAndHealNow(): Promise<HealthResult> {
  const token = botToken();
  if (!token) return { ok: false, healed: false, error: "TELEGRAM_BOT_TOKEN não está definido na Vercel." };

  let info: WebhookInfo | undefined;
  try {
    const r = await tg<WebhookInfo>(token, "getWebhookInfo");
    if (!r.ok) return { ok: false, healed: false, error: r.description || "getWebhookInfo falhou (token inválido?)." };
    info = r.result;
  } catch {
    return { ok: false, healed: false, error: "Sem resposta do Telegram." };
  }

  const now = Math.floor(Date.now() / 1000);
  const recentError = info?.last_error_date && now - info.last_error_date < RECENT_S ? info.last_error_message ?? "erro" : "";
  let reason = "";
  if (!info?.url) reason = "webhook não registado";
  else if (info.url !== WEBHOOK_URL) reason = `webhook aponta para outro endereço (${info.url})`;
  else if (info.allowed_updates && !info.allowed_updates.includes("callback_query")) reason = "webhook não recebe cliques (allowed_updates)";
  else if (/40[134]|unauthorized|forbidden|not found/i.test(recentError)) reason = `o site recusou entregas recentes: ${recentError}`;

  if (!reason) {
    // Outros erros recentes (timeouts, 5xx) sao transitorios: o Telegram volta
    // a tentar sozinho. Reportam-se, mas nao se mexe no registo.
    return { ok: !recentError, healed: false, pending: info?.pending_update_count ?? 0, ...(recentError ? { reason: `erro transitório recente: ${recentError}` } : {}) };
  }

  const fix = await registerWebhook(false);
  if (!fix.ok) return { ok: false, healed: false, reason, error: fix.error };
  return { ok: true, healed: true, reason, pending: info?.pending_update_count ?? 0 };
}
