// Leitura das respostas "global" do CoinGecko e da CoinPaprika (lote F, set
// 2026). Funcoes puras, fora de src/lib/api/market.ts para os testes as
// poderem importar sem o Next. Nunca inventam: o que falta fica null.

export type GlobalNumeros = {
  totalMarketCapUsd: number | null;
  marketCapChange24h: number | null;
  btcDominance: number | null;
  ethDominance: number | null;
  activeCryptocurrencies: number | null;
};

const numOuNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Resposta de /api/v3/global do CoinGecko → números; null se não vier nada útil. */
export function lerGlobalCoinGecko(raw: unknown): GlobalNumeros | null {
  const d = (raw as { data?: {
    total_market_cap?: { usd?: unknown };
    market_cap_change_percentage_24h_usd?: unknown;
    market_cap_percentage?: { btc?: unknown; eth?: unknown };
    active_cryptocurrencies?: unknown;
  } } | null)?.data;
  if (!d) return null;
  const out: GlobalNumeros = {
    totalMarketCapUsd: numOuNull(d.total_market_cap?.usd),
    marketCapChange24h: numOuNull(d.market_cap_change_percentage_24h_usd),
    btcDominance: numOuNull(d.market_cap_percentage?.btc),
    ethDominance: numOuNull(d.market_cap_percentage?.eth),
    activeCryptocurrencies: numOuNull(d.active_cryptocurrencies),
  };
  return out.totalMarketCapUsd && out.totalMarketCapUsd > 0 ? out : null;
}

/** Resposta de api.coinpaprika.com/v1/global → números (sem dominância ETH). */
export function lerGlobalCoinPaprika(raw: unknown): GlobalNumeros | null {
  const j = raw as {
    market_cap_usd?: unknown; market_cap_change_24h?: unknown;
    bitcoin_dominance_percentage?: unknown; cryptocurrencies_number?: unknown;
  } | null;
  if (!j || typeof j !== "object") return null;
  const cap = numOuNull(j.market_cap_usd);
  if (!cap || cap <= 0) return null;
  return {
    totalMarketCapUsd: cap,
    marketCapChange24h: numOuNull(j.market_cap_change_24h),
    btcDominance: numOuNull(j.bitcoin_dominance_percentage),
    // A CoinPaprika não dá a dominância do ETH neste endpoint: fica null, nunca inventada.
    ethDominance: null,
    activeCryptocurrencies: numOuNull(j.cryptocurrencies_number),
  };
}
