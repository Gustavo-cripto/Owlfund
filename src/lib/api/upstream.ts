// Erros de fornecedores externos (CoinGecko, mempool, feeds): distinguem
// "indisponível/limitado" (503 + Retry-After) de "não existe" (404).
import { apiJson } from "@/lib/api/response";

export class UpstreamError extends Error {
  status: number;
  constructor(status: number, source: string) {
    super(`${source} ${status}`);
    this.name = "UpstreamError";
    this.status = status;
  }
}

/** Lança UpstreamError em 429/5xx; devolve a resposta noutros casos. */
export function assertUpstream(res: Response, source: string): Response {
  if (res.status === 429 || res.status >= 500) throw new UpstreamError(res.status, source);
  return res;
}

export function upstreamResponse(err: unknown) {
  const isUp = err instanceof UpstreamError;
  const res = apiJson(
    { error: "upstream_unavailable", message: isUp ? `Fonte externa indisponível (${err.message}). Tenta de novo daqui a pouco.` : "Fonte externa indisponível. Tenta de novo daqui a pouco." },
    { status: 503 },
  );
  res.headers.set("Retry-After", "60");
  return res;
}
