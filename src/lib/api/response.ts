import { NextResponse } from "next/server";

// Resposta JSON da API pública com Cache-Control: no-store — nunca deixar
// dados do utilizador serem guardados em cache por proxies/CDN.
export function apiJson(data: unknown, init?: { status?: number }): NextResponse {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
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
