import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/requireUser";
import { STABLE_EUR, STABLE_USD, TF, type Bar, type SeriesBySymbol, type Timeframe } from "@/lib/portfolio/history";

// Velas (USD) dos ativos do portefolio para reconstruir o historico — ver
// src/lib/portfolio/history.ts. Fonte: OKX (sem chave, responde a datacenters,
// anos de historico). Um pedido por simbolo, em paralelo; simbolos sem par
// USDT vem vazios e o cliente trata-os como valor constante.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SYMBOLS = 25;
const ONE_DAY_MS = 86_400_000;

async function okxCandles(symbol: string, tf: Timeframe): Promise<Bar[]> {
  const { bar, limit } = TF[tf];
  const out: Bar[] = [];
  // /candles da as ~300 mais recentes; para o ano, o resto vem de /history-candles.
  const fetchPage = async (path: string, after?: number) => {
    const url = `https://www.okx.com/api/v5/market/${path}?instId=${symbol}-USDT&bar=${bar}&limit=${Math.min(limit, 300)}${after ? `&after=${after}` : ""}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000), next: { revalidate: tf === "1h" ? 30 : tf === "1d" ? 120 : 600 } });
    if (!res.ok) return [] as Bar[];
    const j = (await res.json()) as { code?: string; data?: string[][] };
    if (j.code !== "0" || !j.data) return [] as Bar[];
    return j.data.map((c) => ({ t: Number(c[0]), o: Number(c[1]), h: Number(c[2]), l: Number(c[3]), c: Number(c[4]) }))
      .filter((b) => [b.t, b.o, b.h, b.l, b.c].every(Number.isFinite) && b.c > 0);
  };
  out.push(...await fetchPage("candles"));
  if (limit > 300 && out.length > 0) {
    const oldest = Math.min(...out.map((b) => b.t));
    out.push(...await fetchPage("history-candles", oldest));
  }
  // Mais recente primeiro na OKX → cronologico; sem duplicados.
  const byT = new Map<number, Bar>();
  for (const b of out) byT.set(b.t, b);
  return [...byT.values()].sort((a, b) => a.t - b.t).slice(-limit);
}

export async function GET(request: Request) {
  const auth = await requireUser(request, { route: "portfolio-history", limit: 60 });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const tf = (searchParams.get("tf") ?? "1d") as Timeframe;
  if (!(tf in TF)) return NextResponse.json({ error: "invalid_tf" }, { status: 400 });
  const symbols = [...new Set((searchParams.get("symbols") ?? "").split(",").map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9]{2,10}$/.test(s)))].slice(0, MAX_SYMBOLS);
  if (symbols.length === 0) return NextResponse.json({ error: "symbols_required" }, { status: 400 });

  const series: SeriesBySymbol = {};
  const constant: string[] = [];
  await Promise.all(symbols.map(async (s) => {
    if (STABLE_USD.has(s) || STABLE_EUR.has(s)) { constant.push(s); return; }
    try {
      const bars = await okxCandles(s, tf);
      // Serie com menos de 2 velas nao desenha nada util: ativo passa a constante.
      if (bars.length >= 2) series[s] = bars; else constant.push(s);
    } catch { constant.push(s); }
  }));
  const from = Date.now() - TF[tf].limit * TF[tf].ms - ONE_DAY_MS;
  return NextResponse.json({ tf, series, constant, from }, { headers: { "Cache-Control": "private, max-age=30" } });
}
