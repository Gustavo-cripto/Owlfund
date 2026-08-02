// Autenticação partilhada de Vercel Cron Jobs: Authorization: Bearer <CRON_SECRET>,
// com comparação em tempo constante (anti timing-attack). Mesmo esquema já usado
// em /api/cron/snapshot. CRON_SECRET obrigatório — sem ele, recusa sempre.

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  // Um dos lados vazio (ex.: pedido sem header Authorization) nunca é válido.
  // Tem de ser tratado ANTES do importKey: a Web Crypto rebenta com
  // "DataError: Zero-length key is not supported" e a rota devolvia 500.
  if (!a || !b) return false;
  if (typeof crypto?.subtle?.importKey !== "function") {
    // Fallback sem subtle crypto — ainda protege contra timing via padding
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }
  const enc = new TextEncoder();
  const [ka, kb] = await Promise.all([
    crypto.subtle.importKey("raw", enc.encode(a).buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    crypto.subtle.importKey("raw", enc.encode(b).buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
  ]);
  const [sa, sb] = await Promise.all([
    crypto.subtle.sign("HMAC", ka, enc.encode("chainfolioai-cron").buffer as ArrayBuffer),
    crypto.subtle.sign("HMAC", kb, enc.encode("chainfolioai-cron").buffer as ArrayBuffer),
  ]);
  const va = new Uint8Array(sa);
  const vb = new Uint8Array(sb);
  if (va.length !== vb.length) return false;
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// True se o pedido traz o CRON_SECRET correto no header Authorization.
// Nunca lança: qualquer falha da Web Crypto recusa o pedido (fail closed) em
// vez de rebentar com 500 — um 500 aqui esconderia a razão real da recusa.
export async function verifyCronAuth(request: Request): Promise<boolean> {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return false;
    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    return await timingSafeEqual(token, cronSecret);
  } catch {
    return false;
  }
}
