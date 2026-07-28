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

// GET /api/derivatives?symbol=BTC — Open Interest, Long/Short, Funding e CVD, tudo da OKX.
export async function GET(req: NextRequest) {
  const base = (req.nextUrl.searchParams.get("symbol") ?? "BTC")
    .toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "BTC";
  const inst = `${base}-USDT-SWAP`;
  const RUBIK = "https://www.okx.com/api/v5/rubik/stat/contracts";

  const [oiRaw, lsRaw, fundRaw, takerRaw, candlesRaw] = await Promise.all([
    okx<string[]>(`${RUBIK}/open-interest-volume?ccy=${base}&period=1H`),
    okx<string[]>(`${RUBIK}/long-short-account-ratio?ccy=${base}&period=1H`),
    okx<{ fundingRate: string; fundingTime: string }>(`https://www.okx.com/api/v5/public/funding-rate-history?instId=${inst}&limit=48`),
    okx<string[]>(`https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=${base}&instType=SPOT&period=1H`),
    okx<string[]>(`https://www.okx.com/api/v5/market/candles?instId=${inst}&bar=1H&limit=48`),
  ]);

  // A OKX devolve do mais recente para o mais antigo → invertemos e ficamos com ~48h.
  // OI: [ts, oiUsd, vol]
  const oi: Point[] = oiRaw.map((r) => ({ t: Number(r[0]), v: Number(r[1]) })).reverse().slice(-48);

  // Long/Short: [ts, ratio] onde ratio = longs/shorts → convertemos em % buy/sell.
  const longShort = lsRaw
    .map((r) => {
      const ratio = Number(r[1]);
      const buy = ratio > 0 ? (ratio / (ratio + 1)) * 100 : 50;
      return { t: Number(r[0]), buy, sell: 100 - buy };
    })
    .reverse()
    .slice(-48);

  // Funding: {fundingRate, fundingTime} (decimal → %).
  const funding: Point[] = fundRaw
    .map((r) => ({ t: Number(r.fundingTime), v: Number(r.fundingRate) * 100 }))
    .reverse();

  // Taker volume [ts, sellVol, buyVol] das últimas ~48h.
  const takerAsc = [...takerRaw].reverse().slice(-48);
  const taker = takerAsc.map((r) => ({ t: Number(r[0]), buy: Number(r[2]), sell: Number(r[1]) }));

  // CVD: acumula (buy - sell) sobre a mesma janela.
  let cum = 0;
  const cvd: Point[] = taker.map((r) => {
    cum += r.buy - r.sell;
    return { t: r.t, v: cum };
  });

  // Velas de preço [ts, o, h, l, c, vol].
  const candles = candlesRaw
    .map((r) => ({ t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), vol: Number(r[5]) }))
    .reverse()
    .slice(-48);

  return NextResponse.json({ symbol: base, oi, longShort, funding, cvd, taker, candles });
}
