import { NextRequest, NextResponse } from "next/server";

export const revalidate = 120; // dados de derivados atualizam devagar

type Point = { t: number; v: number };

// Lê `data` de um endpoint público da OKX (v5). Binance e Bybit bloqueiam os IPs
// de datacenter (451/403) — a OKX responde a partir dos servidores do Vercel.
async function okx<T = string[]>(url: string): Promise<T[]> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const j = (await res.json()) as { code?: string; data?: T[] };
    return j?.code === "0" ? j.data ?? [] : [];
  } catch {
    return [];
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// RSI simples a partir dos fechos (ordem cronológica).
function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (loss === 0) return 100;
  return clamp(100 - 100 / (1 + gain / loss), 0, 100);
}

// GET /api/derivatives?symbol=BTC — OI, Long/Short, Funding, CVD, Taker, velas,
// Put/Call (OKX) + um score de sentimento composto 0–100.
export async function GET(req: NextRequest) {
  const base = (req.nextUrl.searchParams.get("symbol") ?? "BTC")
    .toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "BTC";
  const inst = `${base}-USDT-SWAP`;
  const RUBIK = "https://www.okx.com/api/v5/rubik/stat";

  const [oiRaw, lsRaw, fundRaw, takerRaw, candlesRaw, pcRaw] = await Promise.all([
    okx<string[]>(`${RUBIK}/contracts/open-interest-volume?ccy=${base}&period=1H`),
    okx<string[]>(`${RUBIK}/contracts/long-short-account-ratio?ccy=${base}&period=1H`),
    okx<{ fundingRate: string; fundingTime: string }>(`https://www.okx.com/api/v5/public/funding-rate-history?instId=${inst}&limit=48`),
    okx<string[]>(`${RUBIK}/taker-volume?ccy=${base}&instType=SPOT&period=1H`),
    okx<string[]>(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=1H&limit=48`),
    okx<string[]>(`${RUBIK}/option/open-interest-volume-ratio?ccy=${base}&period=8H`),
  ]);

  // A OKX devolve do mais recente para o mais antigo → invertemos e ficamos com ~48h.
  const oi: Point[] = oiRaw.map((r) => ({ t: Number(r[0]), v: Number(r[1]) })).reverse().slice(-48);

  const longShort = lsRaw
    .map((r) => {
      const ratio = Number(r[1]);
      const buy = ratio > 0 ? (ratio / (ratio + 1)) * 100 : 50;
      return { t: Number(r[0]), buy, sell: 100 - buy };
    })
    .reverse()
    .slice(-48);

  const funding: Point[] = fundRaw
    .map((r) => ({ t: Number(r.fundingTime), v: Number(r.fundingRate) * 100 }))
    .reverse();

  const takerAsc = [...takerRaw].reverse().slice(-48);
  const taker = takerAsc.map((r) => ({ t: Number(r[0]), buy: Number(r[2]), sell: Number(r[1]) }));

  let cum = 0;
  const cvd: Point[] = taker.map((r) => {
    cum += r.buy - r.sell;
    return { t: r.t, v: cum };
  });

  const candles = candlesRaw
    .map((r) => ({ t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), vol: Number(r[5]) }))
    .reverse()
    .slice(-48);

  // Put/Call [ts, oiRatio, volRatio] — rácio puts/calls (>1 = mais puts = bearish).
  const putCall = pcRaw
    .map((r) => ({ t: Number(r[0]), oi: Number(r[1]), vol: Number(r[2]) }))
    .reverse()
    .slice(-48);

  // ── Score de sentimento composto (0–100; 50 = neutro) ──────────────────────
  const rsiVal = rsi(candles.map((c) => c.c));
  const lastLs = longShort[longShort.length - 1];
  const lastTaker = taker[taker.length - 1];
  const lastFunding = funding[funding.length - 1]?.v ?? 0;
  const lastPc = putCall[putCall.length - 1]?.oi ?? 1;

  const cLs = lastLs ? lastLs.buy : 50;
  const cTaker = lastTaker && lastTaker.buy + lastTaker.sell > 0 ? (lastTaker.buy / (lastTaker.buy + lastTaker.sell)) * 100 : 50;
  const cRsi = rsiVal ?? 50;
  const cCvd = cvd.length > 1 ? (cvd[cvd.length - 1].v >= cvd[0].v ? 65 : 35) : 50;
  // funding já vem em % (×100): 0,01% típico → 50+5=55; 0,1% (extremo) → 100. Antes (×4000) saturava sempre.
  const cFunding = clamp(50 + lastFunding * 500, 0, 100);   // funding + = longs a pagar (levemente bullish)
  const hasPutCall = putCall.length > 0;
  // put/call é um rácio assimétrico (0..∞) → escala logarítmica centrada em 1
  const cPutCall = hasPutCall ? clamp(50 - Math.log(Math.max(lastPc, 0.01)) * 30, 0, 100) : 50; // <1 = mais calls = bullish

  const components = { longShort: cLs, taker: cTaker, rsi: cRsi, cvd: cCvd, funding: cFunding, putCall: cPutCall };
  const parts = [cLs, cTaker, cRsi, cCvd, cFunding, ...(hasPutCall ? [cPutCall] : [])];
  const score = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);

  return NextResponse.json({ symbol: base, oi, longShort, funding, cvd, taker, candles, putCall, score, rsi: rsiVal, components, missing: hasPutCall ? [] : ["putCall"] });
}
