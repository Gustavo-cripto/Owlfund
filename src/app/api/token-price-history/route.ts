import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/requireUser";

// Preco de fecho (USD) de um token num dia, para converter taxas pagas em
// token (gas em ETH, SOL…) no valor dessa data — nao no de hoje.
//
// Fonte: velas diarias da OKX (history-candles, ha anos de historico, sem
// chave, e responde a datacenters). Par XXX-USDT; USDT ≈ USD — a conversao
// para a moeda de cada pessoa faz-se no cliente com a taxa de cambio do dia.
export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const auth = await requireUser(request, { route: "token-price-history", limit: 60 });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "").toUpperCase();
  const date = searchParams.get("date") ?? "";
  if (!/^[A-Z0-9]{2,10}$/.test(symbol) || !ISO.test(date)) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const day = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(day) || day > Date.now()) return NextResponse.json({ error: "invalid" }, { status: 400 });

  // Estaveis: 1 USD por definicao (a OKX nao tem USDT-USDT).
  if (["USDT", "USDC", "DAI", "USD"].includes(symbol)) return NextResponse.json({ symbol, date, usd: 1 });

  try {
    // `after` devolve velas ANTERIORES ao instante dado: o fim do dia pedido.
    const url = `https://www.okx.com/api/v5/market/history-candles?instId=${symbol}-USDT&bar=1Dutc&after=${day + 86_400_000}&limit=1`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000), next: { revalidate: 86_400 } });
    if (!res.ok) return NextResponse.json({ error: "upstream" }, { status: 502 });
    const j = (await res.json()) as { code?: string; data?: string[][] };
    const c = j.data?.[0];
    // So vale se a vela for mesmo desse dia (um token listado mais tarde
    // devolveria nada, ou um dia errado).
    if (j.code !== "0" || !c || Number(c[0]) !== day) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const usd = Number(c[4]);
    if (!(usd > 0)) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ symbol, date, usd }, { headers: { "Cache-Control": "private, max-age=86400" } });
  } catch {
    return NextResponse.json({ error: "upstream" }, { status: 502 });
  }
}
