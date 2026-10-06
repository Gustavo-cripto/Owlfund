// Selo do beacon do funil (/api/evento): um cookie HttpOnly que o middleware
// põe em quem carrega uma página, assinado com TRACK_SECRET. O /api/evento só
// aceita eventos de quem o traz. Sem isto, qualquer script podia inflacionar o
// funil com POSTs diretos (a rota é pública e escreve com o service role).
//
// Puro e sem Node: só WebCrypto, para correr no Edge (middleware) e em Node
// (rota). Formato do valor: "<segundos desde 1970>.<hmac hex, 32 chars>".

export const COOKIE_SELO = "cfa-ev";
/** Validade do selo: 1 dia. O middleware renova quando falta ou expirou. */
export const SELO_VALIDADE_S = 86_400;

async function hmacHex(segredo: string, texto: string): Promise<string> {
  const enc = new TextEncoder();
  const chave = await crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", chave, enc.encode(texto));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

/** Cria o valor do cookie para o instante `agoraMs`. */
export async function assinarSelo(segredo: string, agoraMs = Date.now()): Promise<string> {
  const ts = Math.floor(agoraMs / 1000);
  return `${ts}.${await hmacHex(segredo, `ev:${ts}`)}`;
}

/** Verdadeiro se o valor foi assinado com `segredo` há menos de SELO_VALIDADE_S segundos. */
export async function verificarSelo(segredo: string, valor: string | null | undefined, agoraMs = Date.now()): Promise<boolean> {
  if (!segredo || !valor) return false;
  const m = /^(\d{9,11})\.([0-9a-f]{32})$/.exec(valor);
  if (!m) return false;
  const ts = Number(m[1]);
  const agora = Math.floor(agoraMs / 1000);
  if (ts > agora + 60 || agora - ts > SELO_VALIDADE_S) return false;
  const esperado = await hmacHex(segredo, `ev:${ts}`);
  // Comparação em tempo constante (não vaza o segredo pela duração).
  let diff = esperado.length ^ m[2].length;
  for (let i = 0; i < esperado.length; i++) diff |= esperado.charCodeAt(i) ^ (m[2].charCodeAt(i) || 0);
  return diff === 0;
}

/** Lê o valor do cookie a partir do cabeçalho Cookie cru. */
export function lerSelo(cookieHeader: string | null | undefined): string | null {
  const m = new RegExp(`(?:^|;\\s*)${COOKIE_SELO}=([^;]+)`).exec(cookieHeader ?? "");
  return m ? decodeURIComponent(m[1]) : null;
}

/** O selo precisa de renovação: falta, está mal formado ou tem mais de meio dia. */
export function seloPrecisaRenovar(valor: string | null | undefined, agoraMs = Date.now()): boolean {
  const m = /^(\d{9,11})\./.exec(valor ?? "");
  if (!m) return true;
  return Math.floor(agoraMs / 1000) - Number(m[1]) > SELO_VALIDADE_S / 2;
}
