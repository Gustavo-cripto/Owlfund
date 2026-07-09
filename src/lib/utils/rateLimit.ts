// Rate limiter simples em memória, por chave (ex.: `rota:ip`).
// Best-effort: o estado vive por instância serverless e não sobrevive a
// cold starts nem é partilhado entre instâncias — suficiente para travar
// abuso/custo em endpoints de IA. Para limites rígidos usar um store
// partilhado (ex.: Upstash/Redis).

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Devolve true se o pedido é permitido; false se excedeu o limite na janela. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = buckets.get(key);
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

/** Extrai o IP do cliente a partir do cabeçalho x-forwarded-for (Vercel). */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
