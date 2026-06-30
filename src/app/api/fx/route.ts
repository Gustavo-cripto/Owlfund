import { NextResponse } from "next/server";

// Live EUR-based FX rates: how much 1 EUR is worth in each currency.
// Fiat (USD, GBP) from frankfurter.app; BTC from CoinGecko. Cached 60s.
export const revalidate = 60;

type Rates = { EUR: number; USD: number; GBP: number; BTC: number };

const FALLBACK: Rates = { EUR: 1, USD: 1.08, GBP: 0.86, BTC: 0.0000107 };

export async function GET() {
  const rates: Rates = { ...FALLBACK };

  try {
    const [fiatRes, btcRes] = await Promise.all([
      fetch("https://api.frankfurter.app/latest?from=EUR&to=USD,GBP", { next: { revalidate: 60 } }),
      fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur", { next: { revalidate: 60 } }),
    ]);

    if (fiatRes.ok) {
      const j = (await fiatRes.json()) as { rates?: { USD?: number; GBP?: number } };
      if (typeof j.rates?.USD === "number") rates.USD = j.rates.USD;
      if (typeof j.rates?.GBP === "number") rates.GBP = j.rates.GBP;
    }

    if (btcRes.ok) {
      const j = (await btcRes.json()) as { bitcoin?: { eur?: number } };
      const eurPerBtc = j.bitcoin?.eur;
      if (typeof eurPerBtc === "number" && eurPerBtc > 0) rates.BTC = 1 / eurPerBtc;
    }
  } catch {
    /* keep fallback */
  }

  return NextResponse.json({ rates, updatedAt: Date.now() });
}
