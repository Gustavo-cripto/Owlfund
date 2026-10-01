import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/api/requireUser";
import { calcularIndicadores, lerVelasOhlcOkx, type Vela } from "@/lib/market/indicadores";

// GET /api/indicadores?symbol=BTC — leitura técnica do ativo (RSI, médias de 50
// e 200 dias, cruzamentos, volatilidade, máximos e mínimos) a partir de ~300
// velas diárias USDT da OKX. A OKX responde a datacenters; a Binance não.

const OKX = "https://www.okx.com/api/v5/market";

async function pedir(url: string): Promise<Vela[]> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000), next: { revalidate: 900 } });
    return r.ok ? lerVelasOhlcOkx(await r.json()) : [];
  } catch {
    return [];
  }
}

/** Até 300 velas diárias (a OKX dá 100 por pedido; as antigas vêm do histórico). */
async function velas(instId: string): Promise<Vela[]> {
  let todas = await pedir(`${OKX}/candles?instId=${instId}&bar=1Dutc&limit=100`);
  for (let i = 0; i < 2 && todas.length; i++) {
    const antigas = await pedir(`${OKX}/history-candles?instId=${instId}&bar=1Dutc&limit=100&after=${todas[0].t}`);
    if (!antigas.length) break;
    todas = [...antigas.filter((v) => v.t < todas[0].t), ...todas];
  }
  return todas;
}

export async function GET(req: NextRequest) {
  // Proxy com quota nossa: só com sessão, com limite por utilizador.
  const auth = await requireUser(req, { route: "indicadores", limit: 60 });
  if (!auth.ok) return auth.response;

  const symbol = (req.nextUrl.searchParams.get("symbol") ?? "BTC").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  if (!symbol) return NextResponse.json({ error: "symbol_required" }, { status: 400 });
  const ind = calcularIndicadores(await velas(`${symbol}-USDT`));
  if (!ind) return NextResponse.json({ symbol, indicadores: null, motivo: "sem_velas" }, { headers: { "Cache-Control": "private, max-age=300" } });
  return NextResponse.json({ symbol, fonte: "OKX", par: `${symbol}-USDT`, indicadores: ind }, { headers: { "Cache-Control": "private, max-age=900" } });
}
