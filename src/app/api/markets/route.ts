import { NextResponse } from "next/server";
import { rateLimitPublic } from "@/lib/api/requireUser";
import { lastGood, rememberGood } from "@/lib/market/lastGood";
import { cgFetch } from "@/lib/market/coingecko";
import { getGlobalMarket } from "@/lib/api/market";

// "Mercado em tempo real": revalida periodicamente em vez de ficar em cache estática.
// Sem isto, o Next torna a rota estática e os preços/colunas ficam congelados.
// Lote F (set 2026): 300 s, não 60 — o plano gratuito do CoinGecko são 10 000
// pedidos/MÊS e esta rota era a maior gastadora.
export const revalidate = 300;

// O `revalidate` acima não chega, e media-se: a rota respondia em 1,1 a 1,5
// segundos SEMPRE, com `x-vercel-cache: MISS` a cada pedido. A razão é que o
// limite por IP lê o pedido, o que torna a rota dinâmica e faz o Next ignorar
// o `revalidate`. Sem cache, cada visita custava quatro chamadas a serviços de
// fora (CoinEx e três ao CoinGecko) — e cada separador aberto repete isto de
// minuto a minuto.
//
// Isto são preços públicos, iguais para todos: dá para a rede de distribuição
// guardar a resposta e servi-la a todos os outros. É o mesmo que /api/btc-blocks
// já faz. `stale-while-revalidate` serve a última boa enquanto se busca a nova,
// para ninguém esperar pela atualização.
const CACHE = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };

// A resposta inteira são 590 KB, e a maior parte são as linhas de sete dias de
// cada uma das 161 moedas — que servem os gráficos da página /mercado. A fita de
// cotações do topo do site usa três campos de quinze moedas. Pedia os 590 KB em
// TODAS as páginas, a cada minuto, em cada separador aberto.
//
// `?ticker=1` devolve só o que a fita usa. A rede de distribuição guarda as duas
// versões em separado, porque o endereço é diferente.
const TICKER_LINHAS = 15;

// `?nospark=1` é o meio-termo: todas as moedas, todos os campos, menos as linhas
// de sete dias. A página /carteiras precisa de todas as moedas que a pessoa tem,
// mas nunca desenha sparklines — e era o que carregava 500 KB por nada, duas
// vezes ao abrir e outra vez a cada minuto.
function semLinhas(completo: Record<string, unknown>) {
  const linhas = Array.isArray(completo.data) ? completo.data : [];
  return {
    ...completo,
    data: (linhas as Array<Record<string, unknown>>).map((linha) => {
      const copia = { ...linha };
      delete copia.sparkline;
      return copia;
    }),
  };
}

function paraFita(completo: { data?: unknown }) {
  const linhas = Array.isArray(completo.data) ? completo.data : [];
  const usaveis = (linhas as Array<{ symbol?: string; priceUsd?: number | null; change24h?: number | null }>)
    .filter((r) => typeof r.priceUsd === "number" && r.priceUsd > 0)
    .slice(0, TICKER_LINHAS)
    .map((r) => ({ symbol: r.symbol, priceUsd: r.priceUsd, change24h: r.change24h ?? 0 }));
  return { data: usaveis };
}

type CoinExTicker = {
  last: string;
  open: string;
  vol: string;
  value: string;
};

type CoinGeckoRow = {
  id?: string;
  symbol: string;
  name: string;
  current_price?: number | null;
  market_cap: number | null;
  /** Volume 24 h de TODOS os mercados (o da OKX é só uma exchange). */
  total_volume?: number | null;
  price_change_percentage_24h?: number | null;
  sparkline_in_7d?: { price?: number[] };
  price_change_percentage_1h_in_currency?: number | null;
  price_change_percentage_7d_in_currency?: number | null;
  price_change_percentage_30d_in_currency?: number | null;
};

type SentimentRow = {
  symbol: string;
  name: string;
  rsi7d: number | null;
  score: number | null;
  label: string;
};

// OKX como fonte principal dos precos (30 set 2026): a CoinEx passou a devolver
// so mercados "_INDEX" no /spot/ticker sem parametros e "ETHUSDT not found" com
// parametros — nenhum simbolo batia certo, `data` saia vazio e as Carteiras
// ficavam com "Valor: —". A OKX da os 400+ pares USDT num pedido; a CoinEx
// fica a completar o que la faltar. Mesmo formato (SYMBOLUSDT → last/open/value).
/** Linhas do ultimo bom com preco, variacao 24 h e volume desta chamada. */
const precosFrescos = (valor: Record<string, unknown>, tickers: Record<string, CoinExTicker>): Record<string, unknown> => {
  const linhas = Array.isArray(valor.data) ? (valor.data as Array<Record<string, unknown>>) : null;
  if (!linhas) return valor;
  const data = linhas.map((l) => {
    const tk = typeof l.market === "string" ? tickers[l.market] : undefined;
    if (!tk) return l;
    const last = Number(tk.last);
    const open = Number(tk.open);
    if (!(last > 0)) return l;
    // O volume fica o do ultimo bom (global, CoinGecko): o da exchange e so dela.
    return {
      ...l,
      priceUsd: last,
      change24h: open ? ((last - open) / open) * 100 : l.change24h,
    };
  });
  const selectList = Array.isArray(valor.selectList)
    ? (valor.selectList as Array<Record<string, unknown>>).map((e) => {
        const tk = typeof e.symbol === "string" ? tickers[`${e.symbol}USDT`] : undefined;
        const last = tk ? Number(tk.last) : NaN;
        return last > 0 ? { ...e, priceUsd: last } : e;
      })
    : valor.selectList;
  return { ...valor, data, selectList };
};

const extractOkxTickers = (payload: unknown): Record<string, CoinExTicker> => {
  const j = payload as { code?: string; data?: Array<{ instId?: string; last?: string; open24h?: string; volCcy24h?: string }> } | null;
  if (!j || j.code !== "0" || !Array.isArray(j.data)) return {};
  return j.data.reduce<Record<string, CoinExTicker>>((acc, r) => {
    const inst = typeof r?.instId === "string" ? r.instId : "";
    if (!inst.endsWith("-USDT")) return acc;
    const last = Number(r.last);
    if (!(last > 0)) return acc;
    acc[`${inst.slice(0, -5)}USDT`] = { last: String(r.last), open: String(r.open24h ?? ""), vol: "", value: String(r.volCcy24h ?? "") };
    return acc;
  }, {});
};

const extractCoinExTickers = (payload: unknown): Record<string, CoinExTicker> => {
  const data = (payload ?? {}) as Record<string, unknown>;
  const inner = data.data;
  if (Array.isArray(inner)) {
    return inner.reduce<Record<string, CoinExTicker>>((acc, item) => {
      if (!item || typeof item !== "object") return acc;
      const row = item as Record<string, unknown>;
      const bruto = typeof row.market === "string" ? row.market : "";
      if (!bruto) return acc;
      // Desde 30 set 2026 a CoinEx so devolve mercados "XUSDT_INDEX" (preco
      // indice, composto de varias bolsas). Serve para valorizar; entra sob a
      // chave normal se nao houver o par a serio.
      const market = bruto.endsWith("_INDEX") ? bruto.slice(0, -6) : bruto;
      if (acc[market] && bruto.endsWith("_INDEX")) return acc;
      acc[market] = {
        last: String(row.last ?? row.close ?? ""),
        open: String(row.open ?? ""),
        vol: String(row.volume ?? row.vol ?? ""),
        value: String(row.value ?? ""),
      };
      return acc;
    }, {});
  }
  const innerRecord = (inner ?? {}) as Record<string, unknown>;
  const ticker = innerRecord.ticker ?? innerRecord.tickers;
  if (ticker && typeof ticker === "object") {
    return ticker as Record<string, CoinExTicker>;
  }
  return {};
};

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const computeRsi = (prices: number[], period = 14): number | null => {
  if (!Array.isArray(prices) || prices.length < period + 1) return null;
  const deltas: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    deltas.push(prices[i] - prices[i - 1]);
  }
  let gain = 0;
  let loss = 0;
  for (let i = 0; i < period; i += 1) {
    const d = deltas[i] ?? 0;
    if (d >= 0) gain += d;
    else loss += -d;
  }
  gain /= period;
  loss /= period;
  for (let i = period; i < deltas.length; i += 1) {
    const d = deltas[i] ?? 0;
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;
  }
  if (loss === 0) return 100;
  const rs = gain / loss;
  const rsi = 100 - 100 / (1 + rs);
  return clamp(rsi, 0, 100);
};

const labelFromScore = (score: number | null) => {
  if (score == null) return "—";
  if (score < 25) return "Medo extremo";
  if (score < 45) return "Medo";
  if (score < 55) return "Neutro";
  if (score < 75) return "Ganância";
  return "Ganância extrema";
};

const STABLE_SYMBOLS = new Set([
  "USDT",
  "USDC",
  "DAI",
  "BUSD",
  "TUSD",
  "FDUSD",
  "USDE",
  "PYUSD",
  "USDP",
  "EURC",
  "GUSD",
  "FRAX",
]);

// Stablecoins que caem abaixo do top-250 por capitalização e por isso não vêm na
// lista principal do CoinGecko — pedidas à parte para poderem ser registadas como
// posição manual.
const EXTRA_STABLE_IDS = [
  "paxos-standard", // USDP
  "euro-coin",      // EURC
  "binance-usd",    // BUSD
  "gemini-dollar",  // GUSD
  "frax",           // FRAX
];

export async function GET(request: Request) {
  // Rota publica (alimenta paginas sem sessao): limite por IP, sem sessao.
  const limitado = rateLimitPublic(request, "markets", 120);
  if (limitado) return limitado;
  const parametros = new URL(request.url).searchParams;
  const soAFita = parametros.get("ticker") === "1";
  const semSparkline = parametros.get("nospark") === "1";
  // Precos (OKX + CoinEx) desta chamada, para a reserva do catch (ver la em baixo).
  let tickersDaCoinEx: ReturnType<typeof extractCoinExTickers> | null = null;
  try {
    // Duas chamadas ao CoinGecko, nao quatro: o "top 50" para o sentimento e
    // um subconjunto das 250 por capitalizacao — vem da mesma resposta — e o
    // global vem da funcao partilhada com /api/v1/global (cache 30 min e
    // CoinPaprika de reserva). Cada uma com cache propria (lote F).
    const [okxResponse, coinexResponse, coingeckoResponse, coingeckoExtraResponse, globalMarket] = await Promise.all([
      fetch("https://www.okx.com/api/v5/market/tickers?instType=SPOT", { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(6000), next: { revalidate: 30 } }).catch(() => null),
      fetch("https://api.coinex.com/v2/spot/ticker", { signal: AbortSignal.timeout(6000) }).catch(() => null),
      cgFetch(
        "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=true&price_change_percentage=1h,24h,7d,30d",
        // 15 min: o preco e a variacao 24 h vem da CoinEx a cada pedido; do
        // CoinGecko so saem capitalizacao, linhas de 7 dias e 1h/7d/30d.
        // Pedido a toda a hora (fita + /mercado aberto): 2 880/mes no maximo.
        { next: { revalidate: 900 } }
      ),
      // As estaveis extra quase nao mudam e so servem a lista manual: 1 dia.
      cgFetch(
        `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${EXTRA_STABLE_IDS.join(",")}`,
        { next: { revalidate: 86_400 } }
      ),
      // Dados globais: dominância BTC/ETH, capitalização total e variação 24h.
      getGlobalMarket(),
    ]);

    const okxPayload = okxResponse?.ok ? await okxResponse.json().catch(() => null) : null;
    const coinexPayload = coinexResponse?.ok ? await coinexResponse.json().catch(() => null) : null;

    // OKX primeiro; a CoinEx so acrescenta pares que a OKX nao tem.
    const tickers = { ...extractCoinExTickers(coinexPayload), ...extractOkxTickers(okxPayload) };

    // Sem o CoinGecko nao ha tabela (era 200 com data:[] — e o ISR guardava
    // esse vazio 60 s). Agora e falha: serve-se o ultimo bom, ver o catch.
    const coingeckoPayload = coingeckoResponse.ok ? ((await coingeckoResponse.json().catch(() => null)) as CoinGeckoRow[] | null) : null;
    const coingeckoOk = Array.isArray(coingeckoPayload) && coingeckoPayload.length >= 5;

    // Terceira reserva de PRECOS: se a OKX e a CoinEx falharem as duas mas o
    // CoinGecko responder, o current_price dele vale mais do que o stale.
    if ((!tickers.BTCUSDT || !tickers.ETHUSDT) && coingeckoOk) {
      for (const row of coingeckoPayload) {
        const k = `${row.symbol.toUpperCase()}USDT`;
        if (!tickers[k] && typeof row.current_price === "number" && row.current_price > 0) {
          tickers[k] = { last: String(row.current_price), open: "", vol: "", value: "" };
        }
      }
    }
    if (!tickers.BTCUSDT || !tickers.ETHUSDT) throw new Error(`Sem precos de mercado (OKX ${okxResponse?.status ?? "falhou"}, CoinEx ${coinexResponse?.status ?? "falhou"})`);
    tickersDaCoinEx = tickers;
    if (!coingeckoOk) throw new Error(coingeckoResponse.ok ? "CoinGecko sem dados" : `CoinGecko ${coingeckoResponse.status}`);

    const coingeckoTopPayload = coingeckoPayload.slice(0, 50);

    // Falha aqui não deve partir a rota — apenas ficamos sem estas estáveis extra.
    const coingeckoExtraPayload = coingeckoExtraResponse.ok
      ? await coingeckoExtraResponse.json().catch(() => [] as CoinGeckoRow[]) as CoinGeckoRow[]
      : [];

    const coingeckoMap = new Map(
      coingeckoPayload.map((row) => [row.symbol.toUpperCase(), row])
    );

    const rows = coingeckoPayload
      .filter((row) => row.symbol)
      .map((row) => {
        const symbol = row.symbol.toUpperCase();
        const market = `${symbol}USDT`;
        const ticker = tickers[market];
        // Sem par na OKX/CoinEx (o USDT, 3.º maior, nunca tem par contra si
        // proprio) usa-se o preco da CoinGecko. Antes a moeda desaparecia da
        // tabela e o "Top 200" tinha 149 linhas.
        const last = ticker ? Number(ticker.last) : Number(row.current_price);
        if (!(last > 0)) return null;
        const open = ticker ? Number(ticker.open) : NaN;
        const change24h = open ? ((last - open) / open) * 100 : (row.price_change_percentage_24h ?? 0);
        const marketCap = coingeckoMap.get(symbol)?.market_cap ?? null;
        const name = coingeckoMap.get(symbol)?.name ?? symbol;
        // Volume de todos os mercados (CoinGecko). O da OKX era so dela: o BTC
        // aparecia com ~600 milhoes e o XMR (que a OKX nao negoceia) com 0.
        const volume = typeof row.total_volume === "number" ? row.total_volume : ticker ? Number(ticker.value) : 0;

        return {
          market,
          symbol,
          name,
          id: row.id ?? null,
          priceUsd: Number.isFinite(last) ? last : 0,
          change1h: row.price_change_percentage_1h_in_currency ?? null,
          change24h: Number.isFinite(change24h) ? change24h : 0,
          change7d: row.price_change_percentage_7d_in_currency ?? null,
          change30d: row.price_change_percentage_30d_in_currency ?? null,
          marketCapUsd: Number.isFinite(marketCap ?? 0) ? marketCap : null,
          volume24hUsd: Number.isFinite(volume) ? volume : 0,
          sparkline: row.sparkline_in_7d?.price ?? [],
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row)
      .sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0))
      .slice(0, 200);

    const sentimentTop10: SentimentRow[] = coingeckoTopPayload
      .filter((row) => row.symbol)
      .filter((row) => !STABLE_SYMBOLS.has(row.symbol.toUpperCase()))
      .map((row) => {
        const symbol = row.symbol.toUpperCase();
        const prices = row.sparkline_in_7d?.price ?? [];
        const rsi = computeRsi(prices, 14);
        const score = rsi == null ? null : clamp(rsi, 0, 100);
        return {
          symbol,
          name: row.name,
          rsi7d: rsi,
          score,
          label: labelFromScore(score),
        };
      })
      // keep only assets that exist in our CoinEx rows (so clicking always works)
      .filter((row) => rows.some((marketRow) => marketRow.symbol === row.symbol))
      .slice(0, 10);

    // Lista completa para o dropdown "Por ativos cripto manual" (~250 criptos).
    // Inclui stablecoins (USDT, USDC, DAI…): o utilizador pode querer registá-las
    // como posição manual. A tabela de mercado (`data`) e o sentimento continuam
    // sem elas. O preço vai aqui porque alguns ativos (ex.: USDT) não têm par na
    // CoinEx e por isso não aparecem em `data`.
    const toSelectEntry = (row: CoinGeckoRow) => ({
      symbol: row.symbol.toUpperCase(),
      name: row.name ?? row.symbol,
      priceUsd: typeof row.current_price === "number" ? row.current_price : null,
      marketCapUsd: row.market_cap ?? null,
    });

    // Desduplicado por símbolo: o CoinGecko devolve tickers repetidos (ex.: USDF é
    // usado por "Falcon USD" e "Aster USDF"), o que daria chaves repetidas no
    // dropdown. Como vem ordenado por capitalização, o primeiro é o dominante.
    // As estáveis extra entram no fim, se ainda não existirem.
    const bySymbol = new Map<string, ReturnType<typeof toSelectEntry>>();
    for (const row of coingeckoPayload.filter((r) => r.symbol).slice(0, 250)) {
      const entry = toSelectEntry(row);
      if (!bySymbol.has(entry.symbol)) bySymbol.set(entry.symbol, entry);
    }
    for (const row of coingeckoExtraPayload.filter((r) => r?.symbol)) {
      const entry = toSelectEntry(row);
      if (!bySymbol.has(entry.symbol)) bySymbol.set(entry.symbol, entry);
    }

    // Dados globais (dominância + cap total). Falha aqui não parte a rota
    // (getGlobalMarket nunca lança; sem fonte nenhuma fica `global: null`).
    const global = globalMarket.source
      ? {
          totalMarketCapUsd: globalMarket.totalMarketCapUsd,
          marketCapChange24h: globalMarket.marketCapChange24h,
          btcDominance: globalMarket.btcDominance,
          ethDominance: globalMarket.ethDominance,
        }
      : null;

    // Guarda-se sempre o completo: é dele que sai o stale quando o CoinGecko
    // falha, e a fita tira-se do completo sem custo nenhum.
    const completo = rememberGood("markets", {
      data: rows,
      sentimentTop10,
      selectList: [...bySymbol.values()],
      global,
    });
    const corpo = soAFita ? paraFita(completo) : semSparkline ? semLinhas(completo) : completo;
    return NextResponse.json(corpo, { headers: CACHE });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro inesperado.";
    // Ultimo resultado bom desta instancia, marcado como stale.
    const stale = lastGood<Record<string, unknown>>("markets");
    if (stale) {
      console.warn(`[markets] ${msg}; a servir stale de ha ${stale.ageSec}s`);
      // O que falhou foi o CoinGecko (capitalizacao, 7 dias); os PRECOS desta
      // chamada (OKX/CoinEx) estao frescos — entram por cima dos do stale, para
      // as Carteiras nao ficarem a valorizar com precos de ha horas enquanto o
      // CoinGecko estiver em 429 (30 set 2026).
      const comPrecosFrescos = tickersDaCoinEx ? precosFrescos(stale.value, tickersDaCoinEx) : stale.value;
      // Janela curta: a seguir a uma falha queremos voltar a tentar depressa.
      const base = soAFita ? paraFita(comPrecosFrescos) : semSparkline ? semLinhas(comPrecosFrescos) : comPrecosFrescos;
      const corpo = { ...base, stale: true, staleAgeSec: stale.ageSec };
      return NextResponse.json(corpo,
        { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } });
    }
    // Arranque a frio sem ultimo bom, mas ha precos (OKX/CoinEx): serve-se o que
    // ha (preco, variacao 24 h e volume), marcado `partial`. Sem isto a pagina
    // de Carteiras ficava sem precos e todos os valores em moeda a 0 enquanto
    // o CoinGecko estivesse em 429 (auditoria 28 set 2026).
    if (tickersDaCoinEx) {
      const linhas = Object.entries(tickersDaCoinEx)
        .filter(([market]) => market.endsWith("USDT"))
        .map(([market, tk]) => {
          const symbol = market.slice(0, -4);
          const last = Number(tk.last);
          const open = Number(tk.open);
          const volume = Number(tk.value);
          return {
            market, symbol, name: symbol, id: null,
            priceUsd: Number.isFinite(last) ? last : 0,
            change1h: null,
            change24h: open ? ((last - open) / open) * 100 : 0,
            change7d: null, change30d: null, marketCapUsd: null,
            volume24hUsd: Number.isFinite(volume) ? volume : 0,
            sparkline: [] as number[],
          };
        })
        .filter((l) => l.priceUsd > 0 && !STABLE_SYMBOLS.has(l.symbol))
        .sort((a, b) => b.volume24hUsd - a.volume24hUsd)
        .slice(0, 150);
      if (linhas.length >= 5) {
        console.warn(`[markets] ${msg}; sem ultimo bom — a servir so precos OKX/CoinEx (${linhas.length} linhas)`);
        const parcial = {
          data: linhas,
          sentimentTop10: [],
          selectList: linhas.map((l) => ({ symbol: l.symbol, name: l.name, priceUsd: l.priceUsd, marketCapUsd: null })),
          global: null,
        };
        const base = soAFita ? paraFita(parcial) : parcial;
        return NextResponse.json({ ...base, partial: true },
          { headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" } });
      }
    }
    // Sem nada em memoria, deixa-se o erro sair: com `revalidate`, o Next
    // continua a servir a ultima resposta boa que tinha em cache em vez de a
    // substituir por um vazio. So num arranque a frio sem cache e que o
    // cliente ve o erro — e esse ja cai no ticker de exemplo.
    throw new Error(msg);
  }
}
