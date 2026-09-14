// Memoria do ultimo resultado bom de uma rota, por instancia.
//
// As fontes de mercado gratuitas falham a espacos (429 do CoinGecko, bloqueios
// a datacenters). Um 502 nessa altura deixa o dashboard sem precos e a tabela
// de mercado vazia; servir o ultimo resultado bom, marcado como `stale`, e
// quase sempre melhor — precos com alguns minutos valem mais do que nenhuns.
// Vive na memoria do processo: sobrevive enquanto a funcao esta quente, e
// e por isso um complemento ao stale-while-revalidate do CDN, nao um
// substituto.
const store = new Map<string, { at: number; value: unknown }>();

export function rememberGood<T>(key: string, value: T): T {
  store.set(key, { at: Date.now(), value });
  return value;
}

/** Ultimo resultado bom com menos de `maxAgeMs` (por omissao 6 h), ou null. */
export function lastGood<T>(key: string, maxAgeMs = 6 * 3_600_000): { value: T; ageSec: number } | null {
  const hit = store.get(key);
  if (!hit || Date.now() - hit.at > maxAgeMs) return null;
  return { value: hit.value as T, ageSec: Math.round((Date.now() - hit.at) / 1000) };
}
