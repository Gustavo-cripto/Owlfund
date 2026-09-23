import { NextResponse } from "next/server";

// Resposta JSON da API pública com Cache-Control: no-store — nunca deixar
// dados do utilizador serem guardados em cache por proxies/CDN.
/**
 * `no-store` por omissão: quase tudo em /api/v1 é por utilizador e nunca pode
 * ficar numa cache partilhada. As TRÊS rotas públicas (índice, tax-countries,
 * global) passam `cache` — iguais para toda a gente, ficam na rede de
 * distribuição e um agente de IA que as cite não apanha o arranque a frio da
 * função (medido: 7,5 a 8,9 s na primeira chamada, 0,4 s depois). Com
 * stale-while-revalidate serve-se a última boa enquanto se renova.
 */
export function apiJson(data: unknown, init?: { status?: number; cache?: string }): NextResponse {
  const res = NextResponse.json(data, init?.status ? { status: init.status } : undefined);
  res.headers.set("Cache-Control", init?.cache ?? "no-store");
  return res;
}

/**
 * Erro interno para o cliente SEM o detalhe: o texto do Postgres/Supabase
 * (nomes de tabelas e colunas, restricoes) fica no log do servidor, onde
 * interessa, e nao na resposta. Aceita campos extra que a rota queira devolver.
 */
export function internalError(err: { message?: string; code?: string } | null | undefined, extra: Record<string, unknown> = {}): NextResponse {
  console.error("[api] erro interno:", err?.code ?? "", err?.message ?? err);
  return NextResponse.json({ error: "internal_error", ...extra }, { status: 500 });
}
