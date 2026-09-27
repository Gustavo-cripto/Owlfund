// fetch() para o CoinGecko com a chave Demo, se existir.
//
// Sem chave, o CoinGecko conta os pedidos pelo IP de saida — e o da Vercel e
// partilhado por milhares de sites, por isso o 429 aparece sem nos termos
// passado do limite. A chave Demo (gratuita: 30 chamadas/min, 10 000/mes)
// da-nos uma quota so nossa. Env: COINGECKO_API_KEY (Vercel → Production).
//
// Timeout por omissao (10 s): os chamadores com `revalidate` mitigam o custo de
// um CoinGecko lento, mas nao o tempo pendurado. Quem passar `signal` manda.
//
// ── Orcamento (lote F, set 2026) ─────────────────────────────────────────────
// 10 000 pedidos/MES acabavam a meio do mes (429 persistente). Por isso TODAS
// as chamadas ao CoinGecko passam por aqui, e aqui se impoe:
//  1. Cache por URL na cache de dados do Next: `next.revalidate` e sempre
//     posto, com um minimo por tipo de pedido (cgRevalidateMin). Quem pedir
//     mais tempo fica com o seu; quem pedir menos (ou `no-store`) sobe ao minimo.
//     O Next so guarda respostas 200, por isso um 429 nunca fica em cache.
//  2. Travao: depois de um 429, esta instancia nao volta a chamar o CoinGecko
//     durante 5 min — devolve um 429 sintetico e os chamadores caem nos seus
//     planos B (OKX, CoinPaprika, ultimo bom). Martelar a API so estica o 429.

/** Pausa depois de um 429: 5 minutos sem chamar o CoinGecko nesta instancia. */
export const CG_TRAVAO_MS = 5 * 60_000;

/** Minimo de cache (segundos) por tipo de pedido. Funcao pura: testada. */
export function cgRevalidateMin(url: string): number {
  let caminho: string;
  try { caminho = new URL(url).pathname; } catch { return 300; }
  const p = caminho.replace(/^\/api\/v3/, "").replace(/\/+$/, "");
  if (p === "/global") return 600;
  if (p === "/ping") return 3600;
  if (p === "/coins/markets") return 300;
  if (p.startsWith("/simple/")) return 120; // simple/price e simple/token_price
  if (/^\/coins\/[^/]+\/market_chart(\/range)?$/.test(p)) return 1800;
  if (p.startsWith("/search")) return 1800; // search e search/trending
  if (/^\/coins\/[^/]+$/.test(p)) return 3600; // coins/{id}
  return 300;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Resposta devolvida enquanto o travao esta ativo (nao sai para a rede). */
function respostaTravada(restanteMs: number): Response {
  const segundos = Math.max(1, Math.ceil(restanteMs / 1000));
  return new Response(JSON.stringify({ error: "coingecko_rate_limited", retryAfterSec: segundos }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": String(segundos), "X-CG-Travao": "1" },
  });
}

/** Cria um cgFetch com o seu proprio travao. Exportado para os testes (fetch e relogio falsos). */
export function criarCgFetch(fetchImpl: FetchLike, agora: () => number = Date.now) {
  let travadoAte = 0;
  const fn = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const t = agora();
    if (t < travadoAte) return respostaTravada(travadoAte - t);

    const key = process.env.COINGECKO_API_KEY;
    const headers = new Headers(init.headers);
    if (key && !headers.has("x-cg-demo-api-key")) headers.set("x-cg-demo-api-key", key);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");

    // `no-store` desligaria a cache — e e ela que segura o orcamento.
    const { cache, next, ...resto } = init;
    void cache;
    const pedido = typeof next?.revalidate === "number" ? next.revalidate : 0;
    const revalidate = Math.max(pedido, cgRevalidateMin(url));

    const res = await fetchImpl(url, {
      ...resto,
      headers,
      next: { ...next, revalidate },
      signal: init.signal ?? AbortSignal.timeout(10_000),
    });
    if (res.status === 429) {
      travadoAte = agora() + CG_TRAVAO_MS;
      console.warn(`[coingecko] 429 — travao ligado ${CG_TRAVAO_MS / 60_000} min nesta instancia`);
    }
    return res;
  };
  return Object.assign(fn, {
    /** Milissegundos que faltam ao travao (0 = livre). */
    travaoRestanteMs: () => Math.max(0, travadoAte - agora()),
  });
}

// `fetch` lido na altura da chamada: o Next substitui o fetch global pelo seu
// (com a cache de dados) depois de os modulos carregarem.
export const cgFetch = criarCgFetch((url, init) => fetch(url, init));
