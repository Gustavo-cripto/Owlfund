import { NextResponse } from "next/server";
import { rateLimitPublic } from "@/lib/api/requireUser";
import { cgFetch } from "@/lib/market/coingecko";

// Taxas de câmbio com base no euro: quanto vale 1 EUR em cada moeda.
//
// Moeda fiduciária do feed do BCE (frankfurter, gratuito e sem chave); o
// bitcoin da CoinGecko. As moedas aqui são as dos países dos guias fiscais.
//
// O endereço é `api.frankfurter.dev/v1/`: o antigo `api.frankfurter.app`
// passou a responder 301 e só funcionava porque o fetch segue redireções —
// uma dependência silenciosa que mais dia menos dia deixava de funcionar.
export const revalidate = 60;

const FIAT = ["USD", "GBP", "CHF", "CAD", "AUD", "BRL", "PLN", "MXN", "SGD"] as const;

type Rates = Record<string, number>;

// Só até a chamada responder. Não precisam de ser exatos.
const FALLBACK: Rates = {
  EUR: 1, USD: 1.16, GBP: 0.86, CHF: 0.94, CAD: 1.60, AUD: 1.76,
  BRL: 6.30, PLN: 4.25, MXN: 21.5, SGD: 1.50, BTC: 0.0000107,
};

export async function GET(request: Request) {
  // Rota publica (alimenta paginas sem sessao): limite por IP, sem sessao.
  const limitado = rateLimitPublic(request, "fx", 120);
  if (limitado) return limitado;
  const rates: Rates = { ...FALLBACK };

  try {
    const [fiatRes, btcRes] = await Promise.all([
      fetch(`https://api.frankfurter.dev/v1/latest?base=EUR&symbols=${FIAT.join(",")}`, { next: { revalidate: 60 } }),
      cgFetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur", { next: { revalidate: 60 } }),
    ]);

    if (fiatRes.ok) {
      const j = (await fiatRes.json()) as { rates?: Record<string, number> };
      for (const c of FIAT) {
        const v = j.rates?.[c];
        // Uma moeda em falta fica com o valor de recurso, em vez de ir a zero
        // e transformar todos os saldos em 0,00.
        if (typeof v === "number" && v > 0) rates[c] = v;
      }
    }

    if (btcRes.ok) {
      const j = (await btcRes.json()) as { bitcoin?: { eur?: number } };
      const eurPerBtc = j.bitcoin?.eur;
      if (typeof eurPerBtc === "number" && eurPerBtc > 0) rates.BTC = 1 / eurPerBtc;
    }
  } catch {
    /* fica o recurso */
  }

  return NextResponse.json({ rates, updatedAt: Date.now() });
}
