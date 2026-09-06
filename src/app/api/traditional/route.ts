import { NextResponse } from "next/server";

// Cotações de ações/ETFs/índices (Twelve Data).
//
// O plano gratuito dá 8 CRÉDITOS POR MINUTO e cada símbolo gasta 1 crédito —
// com 2 ativos, 4 atualizações por minuto esgotavam a quota e a página passava
// a mostrar "—". Por isso:
//   • guardamos cada símbolo em cache (2 min) partilhada por todos os pedidos;
//   • em falha (ou limite atingido) devolvemos a última cotação conhecida
//     marcada como `stale`, em vez de apagar tudo;
//   • distinguimos "limite atingido" de "erro" para a app dizer a verdade.

export const dynamic = "force-dynamic";

type Quote = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  updatedAt?: string;
};

type TwelveQuote = {
  symbol?: string;
  close?: string;
  percent_change?: string;
  volume?: string;
  datetime?: string;
  status?: string;
  message?: string;
  code?: number;
};

const FRESH_MS = 120_000;            // 2 min: bolsa não mexe ao segundo
const STALE_MS = 7 * 24 * 3600_000;  // aceita valores antigos em falha (fecho/fim de semana)
const cache = new Map<string, { quote: Quote; at: number }>();

const isErrorPayload = (q: TwelveQuote | undefined): boolean =>
  !q || q.status === "error" || (typeof q.code === "number" && q.code >= 400);

function toQuote(sym: string, q: TwelveQuote): Quote {
  return {
    symbol: q.symbol ?? sym,
    price: q.close != null ? Number(q.close) : null,
    changePercent: q.percent_change != null ? Number(q.percent_change) : null,
    volume: q.volume != null ? Number(q.volume) : null,
    updatedAt: q.datetime?.slice(0, 10),
  };
}

type FetchResult = { quotes: Quote[]; rateLimited: boolean; failed: boolean };

async function fetchTwelveData(symbols: string[], apiKey: string): Promise<FetchResult> {
  const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbols.join(","))}&apikey=${apiKey}&dp=2`;

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
  } catch {
    return { quotes: [], rateLimited: false, failed: true };
  }

  // O limite pode vir como 429 HTTP ou como JSON com code 429 (corpo 200).
  if (res.status === 429) return { quotes: [], rateLimited: true, failed: true };
  if (!res.ok) return { quotes: [], rateLimited: false, failed: true };

  const payload = (await res.json().catch(() => null)) as Record<string, TwelveQuote> | TwelveQuote | null;
  if (!payload) return { quotes: [], rateLimited: false, failed: true };

  // Erro global (ex.: sem créditos) — o corpo é um único objeto de erro.
  const asQuote = payload as TwelveQuote;
  if (isErrorPayload(asQuote) && !symbols.some((s) => s in (payload as Record<string, unknown>))) {
    return { quotes: [], rateLimited: asQuote.code === 429, failed: true };
  }

  const entries: [string, TwelveQuote][] =
    symbols.length === 1
      ? [[symbols[0], asQuote]]
      : symbols.map((s) => [s, (payload as Record<string, TwelveQuote>)[s]]).filter(([, q]) => q != null) as [string, TwelveQuote][];

  const quotes: Quote[] = [];
  let rateLimited = false;
  for (const [sym, q] of entries) {
    if (isErrorPayload(q)) {           // erro por símbolo (não existe, sem plano…)
      if (q?.code === 429) rateLimited = true;
      continue;
    }
    quotes.push(toQuote(sym, q));
  }
  return { quotes, rateLimited, failed: quotes.length === 0 };
}

export async function GET(request: Request) {
  const apiKey = (process.env.TWELVEDATA_API_KEY ?? "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { code: "no_key", error: "Cotações de bolsa não configuradas (falta TWELVEDATA_API_KEY).", data: [] },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const symbols = (url.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  if (symbols.length === 0) return NextResponse.json({ data: [] });

  const now = Date.now();
  const out = new Map<string, Quote>();
  const emCache = new Set<string>();

  // 1) O que já está fresco em cache não gasta créditos.
  for (const s of symbols) {
    const hit = cache.get(s);
    if (hit && now - hit.at < FRESH_MS) { out.set(s, hit.quote); emCache.add(s); }
  }

  const emFalta = symbols.filter((s) => !emCache.has(s));
  let rateLimited = false;
  let failed = false;

  if (emFalta.length > 0) {
    const r = await fetchTwelveData(emFalta, apiKey);
    rateLimited = r.rateLimited;
    failed = r.failed;
    for (const q of r.quotes) {
      const key = symbols.includes(q.symbol) ? q.symbol : emFalta[0];
      cache.set(key, { quote: q, at: now });
      out.set(key, q);
    }
  }

  // 2) Falhou? Servimos a última cotação conhecida em vez de "—".
  let stale = false;
  for (const s of symbols) {
    if (out.has(s)) continue;
    const hit = cache.get(s);
    if (hit && now - hit.at < STALE_MS) { out.set(s, hit.quote); stale = true; }
  }

  const data = symbols.map((s) => out.get(s)).filter((q): q is Quote => !!q);

  if (data.length === 0) {
    return NextResponse.json(
      rateLimited
        ? { code: "rate_limited", error: "Limite de cotações da fonte gratuita atingido. Tenta dentro de 1 minuto.", data: [] }
        : { code: "upstream", error: "Não foi possível obter os dados de mercado.", data: [] },
      { status: rateLimited ? 429 : 502 },
    );
  }

  // Há dados (frescos ou em cache): 200 com aviso, para a app não apagar preços.
  return NextResponse.json({
    data,
    stale: stale || undefined,
    code: rateLimited ? "rate_limited" : failed ? "upstream" : undefined,
    cached: emCache.size || undefined,
  });
}
