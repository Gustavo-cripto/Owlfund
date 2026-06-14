const requests = new Map<string, number[]>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 30;

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const hits = (requests.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= MAX_REQUESTS) return false;
  hits.push(now);
  requests.set(ip, hits);
  return true;
}
