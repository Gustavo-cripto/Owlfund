// Rate limiter simples em memória, por chave (ex.: `rota:ip`).
// Best-effort: o estado vive por instância serverless e não sobrevive a
// cold starts nem é partilhado entre instâncias — suficiente para travar
// abuso/custo em endpoints de IA. Para limites rígidos usar um store
// partilhado (ex.: Upstash/Redis).

const buckets = new Map<string, { count: number; resetAt: number }>();
// Sem limpeza, cada IP novo ficava no Map para sempre (bots a rodar IPs faziam
// crescer a memória da instância). Varre as expiradas de vez em quando e põe teto.
const MAX_CHAVES = 10_000;
let chamadas = 0;
function limpar(now: number) {
  for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k);
  // Ainda cheio (ataque com muitas chaves vivas): sai a mais antiga inserida.
  while (buckets.size >= MAX_CHAVES) buckets.delete(buckets.keys().next().value as string);
}

/** Devolve true se o pedido é permitido; false se excedeu o limite na janela. */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  if (++chamadas % 500 === 0 || buckets.size >= MAX_CHAVES) limpar(now);
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

/** Só para testes: número de chaves guardadas. */
export const _tamanhoRateLimit = () => buckets.size;
