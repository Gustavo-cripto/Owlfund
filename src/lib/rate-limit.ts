const requests = new Map<string, number[]>();

const WINDOW_MS = 60_000; // 1 minute
// 30/min por IP era curto: um IP pode ser partilhado (operadora movel, escritorio)
// e uma pessoa com 8 carteiras gastava-o ao abrir a pagina -> 429 -> saldos a
// falhar. As rotas de saldo tem tambem o limite por utilizador do requireUser.
const MAX_REQUESTS = 90;

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const hits = (requests.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_REQUESTS) return false;
  hits.push(now);
  requests.set(ip, hits);
  return true;
}
