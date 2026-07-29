// Autenticação partilhada de Vercel Cron Jobs: Authorization: Bearer <CRON_SECRET>,
// com comparação em tempo constante (anti timing-attack). Mesmo esquema já usado
// em /api/cron/snapshot. CRON_SECRET obrigatório — sem ele, recusa sempre.

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
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
    crypto.subtle.sign("HMAC", ka, enc.encode("owlfund-cron").buffer as ArrayBuffer),
    crypto.subtle.sign("HMAC", kb, enc.encode("owlfund-cron").buffer as ArrayBuffer),
  ]);
  const va = new Uint8Array(sa);
  const vb = new Uint8Array(sb);
  if (va.length !== vb.length) return false;
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

// True se o pedido traz o CRON_SECRET correto no header Authorization.
export async function verifyCronAuth(request: Request): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return timingSafeEqual(token, cronSecret);
}
