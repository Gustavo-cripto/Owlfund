import { NextRequest, NextResponse } from "next/server";

export const revalidate = 120; // dados de derivados atualizam devagar

type Point = { t: number; v: number };

// Lê uma lista da Bybit v5 (endpoints públicos de mercado, sem chave).
async function bybitList(url: string): Promise<Array<Record<string, string>>> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const j = (await res.json()) as { retCode?: number; result?: { list?: Array<Record<string, string>> } };
    return j?.retCode === 0 ? j.result?.list ?? [] : [];
  } catch {
    return [];
  }
}

// GET /api/derivatives?symbol=BTC — Open Interest, Long/Short, Funding (Bybit) + CVD (OKX taker volume).
// Binance está excluída de propósito: bloqueia os IPs de datacenter (451).
export async function GET(req: NextRequest) {
  const base = (req.nextUrl.searchParams.get("symbol") ?? "BTC")
    .toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) || "BTC";
  const sym = `${base}USDT`;

  const [oiRaw, lsRaw, fundRaw, takerJson] = await Promise.all([
    bybitList(`https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${sym}&intervalTime=1h&limit=48`),
    bybitList(`https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${sym}&period=1h&limit=48`),
    bybitList(`https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${sym}&limit=48`),
    fetch(`https://www.okx.com/api/v5/rubik/stat/taker-volume?ccy=${base}&instType=SPOT&period=1H`, { signal: AbortSignal.timeout(8000) })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null) as Promise<{ data?: string[][] } | null>,
  ]);

  // Bybit devolve do mais recente para o mais antigo → invertemos para ordem cronológica.
  const oi: Point[] = oiRaw.map((r) => ({ t: Number(r.timestamp), v: Number(r.openInterest) })).reverse();
  const longShort = lsRaw
    .map((r) => ({ t: Number(r.timestamp), buy: Number(r.buyRatio) * 100, sell: Number(r.sellRatio) * 100 }))
    .reverse();
  const funding: Point[] = fundRaw
    .map((r) => ({ t: Number(r.fundingRateTimestamp), v: Number(r.fundingRate) * 100 })) // em %
    .reverse();

  // CVD: OKX taker-volume vem [ts, sellVol, buyVol] do mais recente ao mais antigo.
  // Acumulamos (buy - sell) em ordem cronológica.
  const takerAsc = [...(takerJson?.data ?? [])].reverse();
  let cum = 0;
  const cvd: Point[] = takerAsc.map((row) => {
    cum += Number(row[2]) - Number(row[1]);
    return { t: Number(row[0]), v: cum };
  });

  return NextResponse.json({ symbol: base, oi, longShort, funding, cvd });
}
