// fetch() para o CoinGecko com a chave Demo, se existir.
//
// Sem chave, o CoinGecko conta os pedidos pelo IP de saida — e o da Vercel e
// partilhado por milhares de sites, por isso o 429 aparece sem nos termos
// passado do limite. A chave Demo (gratuita: 30 chamadas/min, 10 000/mes)
// da-nos uma quota so nossa. Env: COINGECKO_API_KEY (Vercel → Production).
export function cgFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const key = process.env.COINGECKO_API_KEY;
  const headers = new Headers(init.headers);
  if (key && !headers.has("x-cg-demo-api-key")) headers.set("x-cg-demo-api-key", key);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  return fetch(url, { ...init, headers });
}
