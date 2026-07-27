import { NextResponse } from "next/server";

// Resposta JSON da API pública com Cache-Control: no-store — nunca deixar
// dados do utilizador serem guardados em cache por proxies/CDN.
export function apiJson(data: unknown, init?: { status?: number }): NextResponse {
  const res = NextResponse.json(data, init);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
