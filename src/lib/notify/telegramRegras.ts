// Regras PURAS do bot de administração do Telegram: sem rede, sem base de
// dados e sem process.env lido aqui dentro. Estão separadas da rota e do
// telegramWebhook.ts para poderem ser testadas (scripts/testes/telegramRegras.test.ts):
// a 13 set 2026 todos os botões passaram a dar 401 sem ninguém saber, e nada
// disto era verificado antes de chegar a produção.
import { timingSafeEqual } from "node:crypto";

// ─── Segredo do webhook ─────────────────────────────────────────────────────

/**
 * true só se o cabeçalho X-Telegram-Bot-Api-Secret-Token for igual ao segredo
 * esperado. Sem segredo configurado, recusa sempre (nunca "aberto por defeito").
 */
export function segredoConfere(recebido: string | null | undefined, esperado: string): boolean {
  const got = recebido ?? "";
  if (!esperado || got.length !== esperado.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(esperado));
}

// ─── Quem pode carregar nos botões ──────────────────────────────────────────

export type ConfigAdmin = {
  /** Ids de UTILIZADOR do Telegram autorizados a carregar nos botões. */
  adminIds: string[];
  /** Chat para onde os avisos são enviados (TELEGRAM_CHAT_ID). */
  chatId: string;
};

/**
 * TELEGRAM_ADMIN_USER_IDS (ids separados por vírgulas) diz QUEM pode carregar.
 * Sem ela, usa o TELEGRAM_CHAT_ID: num chat privado com o bot, o id do chat é
 * igual ao id do utilizador. Num grupo (id negativo) isso não serve — aí é
 * preciso definir TELEGRAM_ADMIN_USER_IDS.
 */
export function configAdmin(adminUserIds: string | undefined, chatId: string | undefined): ConfigAdmin {
  const chat = (chatId ?? "").trim();
  const lista = (adminUserIds ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^-?\d+$/.test(s));
  return { adminIds: lista.length ? lista : chat ? [chat] : [], chatId: chat };
}

/**
 * Autoriza um clique: quem carregou tem de estar na lista e, se o clique vier
 * de uma mensagem, essa mensagem tem de estar no chat configurado (os botões
 * só existem lá; um clique noutro chat não é nosso).
 */
export function cliqueAutorizado(
  clique: { fromId?: number | string | null; chatId?: number | string | null },
  cfg: ConfigAdmin,
): boolean {
  if (!cfg.adminIds.length) return false;
  const de = clique.fromId == null ? "" : String(clique.fromId);
  if (!de || !cfg.adminIds.includes(de)) return false;
  if (clique.chatId != null && cfg.chatId && String(clique.chatId) !== cfg.chatId) return false;
  return true;
}

// ─── callback_data dos botões ───────────────────────────────────────────────

export type AcaoBotao =
  | { tipo: "fundador"; userId: string }
  | { tipo: "dispensar"; email: string }
  | { tipo: "ativar"; plano: "pro" | "premium"; email: string }
  | { tipo: "feito" };

/**
 * Lê o callback_data dos botões das notificações:
 *   f:<uuid>               confirmar preço de fundador
 *   x:<email>              dispensar a inscrição
 *   g:pro|premium:<email>  ativar o tester
 *   done                   botão de "já tratado" (depois do markDone)
 * Qualquer outra coisa devolve null.
 */
export function lerCallback(data: string | null | undefined): AcaoBotao | null {
  const d = String(data ?? "");
  if (d === "done") return { tipo: "feito" };
  const f = d.match(/^f:([0-9a-f-]{36})$/);
  if (f) return { tipo: "fundador", userId: f[1] };
  const x = d.match(/^x:(.+)$/);
  if (x) return { tipo: "dispensar", email: x[1] };
  const g = d.match(/^g:(pro|premium):(.+)$/);
  if (g) return { tipo: "ativar", plano: g[1] as "pro" | "premium", email: g[2] };
  return null;
}

// ─── Respostas da API do Telegram ───────────────────────────────────────────

export type CorpoTelegram<T> = { ok?: boolean; result?: T; description?: string; error_code?: number };

export type ChamadaTelegram<T> =
  | { tipo: "ok"; result?: T }
  /** Sem resposta, timeout, 5xx, 429 ou corpo que não é JSON: o Telegram volta a estar bem sozinho. */
  | { tipo: "transitorio"; detalhe: string }
  /** O Telegram respondeu e recusou (token inválido, pedido errado): precisa de alguém. */
  | { tipo: "recusado"; detalhe: string };

/**
 * Classifica uma chamada à API do Telegram.
 * `httpStatus` null = não houve resposta (rede ou timeout).
 * `corpo` null = a resposta não era JSON (ex.: 502 em HTML de um proxy).
 */
export function classificarResposta<T>(httpStatus: number | null, corpo: CorpoTelegram<T> | null): ChamadaTelegram<T> {
  if (httpStatus == null) return { tipo: "transitorio", detalhe: "sem resposta do Telegram" };
  if (corpo && corpo.ok) return { tipo: "ok", result: corpo.result };
  const codigo = corpo?.error_code ?? httpStatus;
  const detalhe = `${codigo}${corpo?.description ? ` ${corpo.description}` : ""}`;
  if (!corpo || httpStatus >= 500 || codigo >= 500 || codigo === 429) return { tipo: "transitorio", detalhe };
  return { tipo: "recusado", detalhe };
}

// ─── Diagnóstico do registo do webhook ──────────────────────────────────────

export type InfoWebhook = {
  url?: string;
  pending_update_count?: number;
  last_error_date?: number;
  last_error_message?: string;
  allowed_updates?: string[];
};

/** Uma verificação corre de hora a hora; um erro mais recente do que isto é novo. */
export const RECENTE_S = 70 * 60;

/**
 * Decide se o registo do webhook está mal (`motivo` preenchido = é preciso
 * voltar a registar). `erroRecente` são os outros erros recentes (timeouts,
 * 5xx): transitórios, reportam-se mas não se mexe no registo.
 */
export function diagnosticarWebhook(
  info: InfoWebhook | undefined,
  agoraS: number,
  urlEsperado: string,
): { motivo: string; erroRecente: string } {
  const erroRecente = info?.last_error_date && agoraS - info.last_error_date < RECENTE_S ? info.last_error_message ?? "erro" : "";
  let motivo = "";
  if (!info?.url) motivo = "webhook não registado";
  else if (info.url !== urlEsperado) motivo = `webhook aponta para outro endereço (${info.url})`;
  else if (info.allowed_updates && !info.allowed_updates.includes("callback_query")) motivo = "webhook não recebe cliques (allowed_updates)";
  else if (/40[134]|unauthorized|forbidden|not found/i.test(erroRecente)) motivo = `o site recusou entregas recentes: ${erroRecente}`;
  return { motivo, erroRecente: motivo ? "" : erroRecente };
}
