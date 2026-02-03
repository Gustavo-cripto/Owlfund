"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import AppHeader from "@/components/AppHeader";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";

type MarketRow = {
  market: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  marketCapUsd: number | null;
  volume24hUsd: number;
};

type SortKey = "marketCapUsd" | "priceUsd" | "change24h" | "volume24hUsd" | "symbol";
type SortDir = "desc" | "asc";

const FAVORITES_KEY = "owlfund.market.favorites.v1";

const loadFavorites = () => {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((v) => typeof v === "string"));
  } catch {
    return new Set<string>();
  }
};

const saveFavorites = (favorites: Set<string>) => {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
  } catch {
    // ignore
  }
};

type SentimentRow = {
  symbol: string;
  name: string;
  rsi7d: number | null;
  score: number | null;
  label: string;
};

const formatCurrency = (value: number, digits = 2) =>
  value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

const formatCompact = (value: number) =>
  value.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  });

const formatPercent = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;

const hashSeed = (value: string) =>
  value.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);

type FearGreedApiRow = {
  value: string;
  value_classification: string;
  timestamp: string;
  time_until_update?: string;
};

type FearGreedPoint = {
  value: number;
  classification: string;
  timestampSec: number;
};

const toNumber = (value: unknown, fallback = 0) => {
  const num = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(num) ? num : fallback;
};

const pad2 = (value: number) => String(value).padStart(2, "0");

const formatCountdown = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) return `${h}h ${pad2(m)}m ${pad2(s)}s`;
  if (m > 0) return `${m}m ${pad2(s)}s`;
  return `${s}s`;
};

const formatDateShort = (timestampSec: number) => {
  try {
    return new Date(timestampSec * 1000).toLocaleDateString("pt-PT", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "";
  }
};

const mapClassificationPt = (value: string) => {
  switch (value) {
    case "Extreme Fear":
      return "Medo extremo";
    case "Fear":
      return "Medo";
    case "Neutral":
      return "Neutro";
    case "Greed":
      return "Ganância";
    case "Extreme Greed":
      return "Ganância extrema";
    default:
      return value;
  }
};

function FearGreedGauge({ value }: { value: number }) {
  const uid = useId();
  const gradId = `${uid}-fng-grad`;
  const shadowId = `${uid}-softShadow`;
  const v = Math.max(0, Math.min(100, value));
  // map 0..100 => 180..0 (left -> right)
  const angle = 180 - (v / 100) * 180;
  const cx = 120;
  const cy = 110;
  const r = 82;
  const needleLen = 70;
  const rad = (angle * Math.PI) / 180;
  const nx = cx + Math.cos(rad) * needleLen;
  // SVG y axis grows downward, invert sin
  const ny = cy - Math.sin(rad) * needleLen;

  return (
    <svg viewBox="0 0 240 140" className="w-full" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="35%" stopColor="#f59e0b" />
          <stop offset="60%" stopColor="#eab308" />
          <stop offset="100%" stopColor="#22c55e" />
        </linearGradient>
        <filter id={shadowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* arc */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="18"
        strokeLinecap="round"
        filter={`url(#${shadowId})`}
      />

      {/* needle */}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#94a3b8" strokeWidth="6" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="10" fill="#e2e8f0" />
      <circle cx={cx} cy={cy} r="6" fill="#94a3b8" />

      {/* value bubble */}
      <g transform={`translate(${20},${92})`}>
        <circle cx="18" cy="18" r="18" fill="#c2410c" />
        <text x="18" y="23" textAnchor="middle" fontSize="14" fill="#fff" fontWeight="700">
          {Math.round(v)}
        </text>
      </g>
    </svg>
  );
}

function FearGreedWidget({
  points,
  timeUntilUpdateSec,
  top10,
  onSelectSymbol,
  selectedSymbol,
}: {
  points: FearGreedPoint[];
  timeUntilUpdateSec: number | null;
  top10: SentimentRow[];
  onSelectSymbol: (symbol: string) => void;
  selectedSymbol: string | null;
}) {
  const now = points[0];
  const yesterday = points[1];
  const lastWeek = points[7];
  const lastMonth = points[30];
  const selected = selectedSymbol
    ? top10.find((row) => row.symbol === selectedSymbol) ?? null
    : null;

  const rows = [
    { label: "Agora", point: now },
    { label: "Ontem", point: yesterday },
    { label: "Última semana", point: lastWeek },
    { label: "Último mês", point: lastMonth },
  ].filter((row) => row.point);

  const updatedAt = now ? formatDateShort(now.timestampSec) : "";

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-start gap-3">
          <div className="text-2xl leading-none">₿</div>
          <div>
            <h2 className="text-base font-semibold text-white">Fear &amp; Greed Index</h2>
            <p className="text-xs text-slate-500">Global (alternative.me)</p>
          </div>
        </div>

        <div className="mt-4">
          {now ? <FearGreedGauge value={now.value} /> : <div className="h-[140px] w-full animate-pulse rounded-xl bg-slate-950/60" />}
        </div>

        <div className="mt-2">
          <p className="text-sm text-slate-400">Agora:</p>
          <p className="text-lg font-semibold text-white">{now ? mapClassificationPt(now.classification) : "A carregar..."}</p>
          <p className="mt-2 text-xs text-slate-500">
            {updatedAt ? `Última atualização: ${updatedAt}` : " "}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="text-sm font-semibold text-white">Valores históricos</h3>
        <div className="mt-4 flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-200">{row.label}</p>
                <p className="text-xs text-slate-500">
                  {mapClassificationPt(row.point!.classification)}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600/90 text-sm font-semibold text-white">
                {row.point!.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="text-sm font-semibold text-white">Próxima atualização</h3>
        <p className="mt-4 text-sm text-slate-400">A próxima atualização acontece em:</p>
        <p className="mt-2 text-lg font-semibold text-white">
          {timeUntilUpdateSec == null ? "—" : formatCountdown(timeUntilUpdateSec)}
        </p>
        <p className="mt-4 text-xs text-slate-500">Fonte: alternative.me</p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Fear &amp; Greed do ativo</h3>
            <p className="text-xs text-slate-500">
              {selectedSymbol ? `${selectedSymbol} · estimativa por RSI (7d)` : "Selecione um ativo"}
            </p>
          </div>
          {selected && (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600/90 text-sm font-semibold text-white">
              {selected.score == null ? "—" : Math.round(selected.score)}
            </div>
          )}
        </div>

        <div className="mt-4">
          {selected?.score != null ? (
            <FearGreedGauge value={selected.score} />
          ) : (
            <div className="h-[140px] w-full rounded-xl border border-slate-800 bg-slate-950/50 p-4">
              <p className="text-sm text-slate-300">
                {selectedSymbol
                  ? "Sem dados para este ativo (fora do Top 10)."
                  : "Selecione um ativo para ver o indicador."}
              </p>
            </div>
          )}
        </div>

        {selected && (
          <p className="mt-2 text-sm font-semibold text-white">{selected.label}</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="text-sm font-semibold text-white">Fear &amp; Greed (ETH + mais 9)</h3>
        <p className="mt-1 text-xs text-slate-500">Estimativa por RSI (7d) · Top 10 por market cap</p>
        <div className="mt-4 flex flex-col gap-3">
          {top10.length ? (
            top10.map((row) => (
              <button
                key={row.symbol}
                type="button"
                className="flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2 text-left transition hover:border-slate-600"
                onClick={() => onSelectSymbol(row.symbol)}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{row.symbol}</p>
                  <p className="truncate text-xs text-slate-500">{row.label}</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-xs text-slate-400">RSI</div>
                  <div className="flex h-8 w-10 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white">
                    {row.rsi7d == null ? "—" : Math.round(row.rsi7d)}
                  </div>
                </div>
              </button>
            ))
          ) : (
            <p className="text-sm text-slate-400">A carregar...</p>
          )}
        </div>
      </div>
    </div>
  );
}

const buildSparkline = (change: number, seed: number) => {
  const points: Array<[number, number]> = [];
  const base = change >= 0 ? 9 : 13;
  const amplitude = 4;
  for (let i = 0; i <= 8; i += 1) {
    const x = (i / 8) * 100;
    const noise = Math.sin((i + seed) * 0.7) * amplitude;
    const trend = (change >= 0 ? -1 : 1) * (i / 8) * 6;
    const y = Math.max(2, Math.min(18, base + noise + trend));
    points.push([x, y]);
  }
  return points.map((point) => point.join(",")).join(" ");
};

function TrendSparkline({
  change,
  seed,
  isLight,
}: {
  change: number;
  seed: number;
  isLight: boolean;
}) {
  const isUp = change >= 0;
  const upColor = "#22c55e";
  const downColor = "#ef4444";
  const outlineColor = "#0f172a";
  const points = buildSparkline(change, seed);
  return (
    <svg width="90" height="24" viewBox="0 0 100 20" aria-hidden>
      {!isLight && !isUp && (
        <polyline
          fill="none"
          stroke={outlineColor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />
      )}
      <polyline
        fill="none"
        stroke={isUp ? upColor : downColor}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
}

function TradingViewWidget({
  symbol,
  interval,
}: {
  symbol: string;
  interval: string;
}) {
  const containerId = useMemo(() => {
    const safe = `${symbol}-${interval}`.replace(/[^a-zA-Z0-9_-]/g, "-");
    return `tradingview-widget-${safe}`;
  }, [symbol, interval]);

  useEffect(() => {
    const scriptId = "tradingview-widget-script";
    const ensureScript = () =>
      new Promise<void>((resolve) => {
        if (document.getElementById(scriptId)) {
          resolve();
          return;
        }
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://s3.tradingview.com/tv.js";
        script.async = true;
        script.onload = () => resolve();
        document.body.appendChild(script);
      });

    ensureScript().then(() => {
      const container = document.getElementById(containerId);
      if (!container || !("TradingView" in window)) return;
      container.innerHTML = "";
      // @ts-expect-error TradingView is injected by script
      new window.TradingView.widget({
        container_id: containerId,
        symbol,
        interval,
        timezone: "Etc/UTC",
        theme: "dark",
        style: 1,
        locale: "pt",
        enable_publishing: false,
        hide_top_toolbar: false,
        withdateranges: true,
        hide_side_toolbar: true,
        save_image: false,
        autosize: true,
        studies: [
          "RSI@tv-basicstudies",
          "MACD@tv-basicstudies",
          "Volume@tv-basicstudies",
          "MASimple@tv-basicstudies",
        ],
      });
    });
  }, [symbol, interval, containerId]);

  return <div id={containerId} className="h-full w-full" />;
}

export default function MercadoPage() {
  useRequireAuth("/login");
  const [rows, setRows] = useState<MarketRow[]>([]);
  const [selected, setSelected] = useState<MarketRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Timeframes are controlled inside each chart widget (TradingView/Coinglass),
  // so we don't render an extra timeframe bar in the page UI.
  const [isLightMode, setIsLightMode] = useState(false);
  const [chartSource, setChartSource] = useState<"tradingview" | "coinglass">(
    "tradingview"
  );
  const [fearGreedPoints, setFearGreedPoints] = useState<FearGreedPoint[]>([]);
  const [fearGreedCountdown, setFearGreedCountdown] = useState<number | null>(null);
  const [sentimentTop10, setSentimentTop10] = useState<SentimentRow[]>([]);
  const [page, setPage] = useState(0);
  const pageSize = 20;
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("marketCapUsd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showFavorites, setShowFavorites] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const closeTradingViewOverlay = () => {
    // Best-effort: closes TradingView popovers/panels (e.g., Markets/Favorites/Trending).
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        which: 27,
        bubbles: true,
      })
    );
  };

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/markets");
        const data = (await response.json()) as {
          data?: MarketRow[];
          sentimentTop10?: SentimentRow[];
          error?: string;
        };
        if (!response.ok || !data.data) {
          throw new Error(data.error ?? "Não foi possível carregar mercados.");
        }
        setRows(data.data);
        setSelected(data.data[0] ?? null);
        setSentimentTop10(data.sentimentTop10 ?? []);
        setPage(0);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar mercados.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    setFavorites(loadFavorites());
  }, []);

  useEffect(() => {
    const loadFearGreed = async () => {
      try {
        const response = await fetch("https://api.alternative.me/fng/?limit=32&format=json");
        const payload = (await response.json()) as { data?: FearGreedApiRow[] };
        const data = payload.data ?? [];
        const points = data
          .map((row) => ({
            value: toNumber(row.value, 0),
            classification: row.value_classification ?? "",
            timestampSec: toNumber(row.timestamp, 0),
          }))
          .filter((row) => row.timestampSec > 0);
        setFearGreedPoints(points);
        const first = data[0];
        const next = first?.time_until_update ? toNumber(first.time_until_update, 0) : null;
        setFearGreedCountdown(next);
      } catch {
        setFearGreedPoints([]);
        setFearGreedCountdown(null);
      }
    };
    loadFearGreed();
  }, []);

  useEffect(() => {
    if (fearGreedCountdown == null) return;
    const id = window.setInterval(() => {
      setFearGreedCountdown((prev) => {
        if (prev == null) return prev;
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [fearGreedCountdown]);

  useEffect(() => {
    const updateTheme = () =>
      setIsLightMode(document.body.classList.contains("theme-light"));
    updateTheme();
    const observer = new MutationObserver(updateTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const tradingViewSymbol = useMemo(() => {
    // Use BINANCE symbols for better widget compatibility (table is still CoinEx).
    if (!selected) return "BINANCE:BTCUSDT";
    return `BINANCE:${selected.market}`;
  }, [selected]);

  const coinglassUrl = useMemo(() => {
    const market = selected?.market ?? "BTCUSDT";
    return `https://www.coinglass.com/tv/Binance_${market}`;
  }, [selected]);

  const tradingViewInterval = "D";

  const toggleFavorite = (symbol: string) => {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      saveFavorites(next);
      return next;
    });
  };

  const filteredSortedRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = showFavorites ? rows.filter((r) => favorites.has(r.symbol)) : rows;
    const filtered = q
      ? base.filter((r) => r.symbol.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
      : base;
    const dir = sortDir === "asc" ? 1 : -1;
    const num = (value: number | null) => (typeof value === "number" ? value : 0);
    const sorted = [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "marketCapUsd":
          return (num(a.marketCapUsd) - num(b.marketCapUsd)) * dir;
        case "volume24hUsd":
          return (a.volume24hUsd - b.volume24hUsd) * dir;
        case "priceUsd":
          return (a.priceUsd - b.priceUsd) * dir;
        case "change24h":
          return (a.change24h - b.change24h) * dir;
        case "symbol":
          return a.symbol.localeCompare(b.symbol) * dir;
        default:
          return 0;
      }
    });
    // keep selected visible feel: favorites already filter; otherwise no
    return sorted;
  }, [rows, query, sortKey, sortDir, showFavorites, favorites]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredSortedRows.length / pageSize)),
    [filteredSortedRows.length]
  );

  const currentPage = Math.min(page, totalPages - 1);
  const pagedRows = useMemo(() => {
    const start = currentPage * pageSize;
    return filteredSortedRows.slice(start, start + pageSize);
  }, [filteredSortedRows, currentPage]);

  const pageRange = useMemo(() => {
    const start = currentPage * pageSize;
    const end = Math.min(filteredSortedRows.length, start + pageSize);
    return { start, end, total: filteredSortedRows.length };
  }, [currentPage, filteredSortedRows.length]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader variant="app" subtitle="Panorama do mercado" />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 pb-20 pt-2 lg:px-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold text-white">Mercado</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Dados em tempo real da CoinEx com comparação entre ativos. Clique em um
            ativo para abrir o gráfico do TradingView.
          </p>
        </div>

        <section className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Gráfico do ativo</h2>
              <p className="text-sm text-slate-400">
                {selected ? `${selected.name} · ${selected.symbol}` : "Selecione um ativo"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* timeframe bar removed (use chart internal controls) */}
              <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs font-semibold text-slate-200">
                <button
                  type="button"
                  className={`rounded-full px-3 py-1 transition ${
                    chartSource === "tradingview"
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  onClick={() => setChartSource("tradingview")}
                >
                  TradingView
                </button>
                <button
                  type="button"
                  className={`rounded-full px-3 py-1 transition ${
                    chartSource === "coinglass"
                      ? "bg-slate-800 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  onClick={() => setChartSource("coinglass")}
                >
                  Coinglass
                </button>
              </div>
              {chartSource === "tradingview" && (
                <button
                  type="button"
                  className="rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                  onClick={closeTradingViewOverlay}
                  title="Minimiza/fecha o painel (Markets/Favorites/Trending) do TradingView"
                >
                  Minimizar painel
                </button>
              )}
              <button
                type="button"
                className="rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                onClick={() => {
                  if (document.fullscreenElement) {
                    document.exitFullscreen();
                    return;
                  }
                  chartRef.current?.requestFullscreen?.();
                }}
              >
                {isFullscreen ? "Sair do ecrã inteiro" : "Ecrã inteiro"}
              </button>
            </div>
          </div>
          <div
            className={`mt-6 ${
              isFullscreen ? "h-[92vh] px-2 py-3" : "h-[560px] lg:h-[640px]"
            } relative`}
            ref={chartRef}
          >
            {isFullscreen && (
              <button
                type="button"
                className="absolute right-4 top-4 z-50 rounded-full border border-slate-700 bg-slate-950/90 px-4 py-2 text-xs font-semibold text-slate-100 shadow-lg transition hover:border-slate-500 hover:text-white"
                onClick={() => document.exitFullscreen()}
              >
                Sair do ecrã inteiro
              </button>
            )}
            {chartSource === "tradingview" ? (
              <TradingViewWidget
                key={`${tradingViewSymbol}-${tradingViewInterval}`}
                symbol={tradingViewSymbol}
                interval={tradingViewInterval}
              />
            ) : (
              <iframe
                title="Coinglass chart"
                src={coinglassUrl}
                key={coinglassUrl}
                className="h-full w-full rounded-xl border border-slate-800"
                loading="lazy"
                allowFullScreen
              />
            )}
          </div>
        </section>

        <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[420px_1fr]">
          <aside className="order-2 lg:order-1">
            <FearGreedWidget
              points={fearGreedPoints}
              timeUntilUpdateSec={fearGreedCountdown}
              top10={sentimentTop10}
              onSelectSymbol={(symbol) => {
                const match = rows.find((row) => row.symbol === symbol);
                if (match) {
                  setSelected(match);
                  chartRef.current?.scrollIntoView({ behavior: "smooth" });
                }
              }}
              selectedSymbol={selected?.symbol ?? null}
            />
          </aside>

          <div className="order-1 lg:order-2">
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Top 200 criptoativos</h2>
                <span className="text-xs text-slate-500">
                  Fonte: CoinEx · atualização automática
                </span>
              </div>

              {isLoading ? (
                <p className="mt-6 text-sm text-slate-400">A carregar mercados...</p>
              ) : error ? (
                <p className="mt-6 text-sm text-rose-300">{error}</p>
              ) : (
                <div className="mt-6">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex flex-1 flex-wrap items-center gap-3">
                      <input
                        value={query}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setPage(0);
                        }}
                        placeholder="Pesquisar (ex: BTC, Ethereum)"
                        className="w-full max-w-xs rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600"
                      />
                      <button
                        type="button"
                        className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                          showFavorites
                            ? "border-slate-600 bg-slate-800 text-white"
                            : "border-slate-700 bg-slate-950/80 text-slate-200 hover:border-slate-500 hover:text-white"
                        }`}
                        onClick={() => {
                          setShowFavorites((v) => !v);
                          setPage(0);
                        }}
                      >
                        {showFavorites ? "A mostrar favoritos" : "Mostrar favoritos"}
                      </button>
                      <div className="flex items-center gap-2">
                        <select
                          value={sortKey}
                          onChange={(e) => setSortKey(e.target.value as SortKey)}
                          className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-200 outline-none focus:border-slate-600"
                        >
                          <option value="marketCapUsd">Market cap</option>
                          <option value="volume24hUsd">Volume 24h</option>
                          <option value="priceUsd">Preço</option>
                          <option value="change24h">Variação 24h</option>
                          <option value="symbol">Símbolo</option>
                        </select>
                        <button
                          type="button"
                          className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                        >
                          {sortDir === "asc" ? "Asc" : "Desc"}
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">
                      Mostrando{" "}
                      <span className="font-semibold text-slate-200">{pageRange.total ? pageRange.start + 1 : 0}</span>
                      {"–"}
                      <span className="font-semibold text-slate-200">{pageRange.end}</span> de{" "}
                      <span className="font-semibold text-slate-200">{pageRange.total}</span>
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={currentPage <= 0}
                      >
                        Anterior
                      </button>
                      <div className="text-xs text-slate-400">
                        Página <span className="font-semibold text-slate-200">{currentPage + 1}</span> /{" "}
                        <span className="font-semibold text-slate-200">{totalPages}</span>
                      </div>
                      <button
                        type="button"
                        className="rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                        disabled={currentPage >= totalPages - 1}
                      >
                        Próximo
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      <tr className="border-b border-slate-800">
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">Cripto</th>
                        <th className="px-4 py-3">Preço (USD)</th>
                        <th className="px-4 py-3">Variação 24h</th>
                        <th className="px-4 py-3">Valor de Mercado (USD)</th>
                        <th className="px-4 py-3">Volume 24h (USD)</th>
                        <th className="px-4 py-3">Tendência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedRows.map((row, index) => {
                        const selectRow = () => {
                          setSelected(row);
                          chartRef.current?.scrollIntoView({ behavior: "smooth" });
                        };
                        return (
                        <tr
                          key={row.market}
                          className={`cursor-pointer border-b border-slate-800/60 transition hover:bg-slate-950/60 ${
                            selected?.market === row.market ? "bg-slate-950/50" : ""
                          }`}
                          role="button"
                          tabIndex={0}
                          onClick={selectRow}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectRow();
                            }
                          }}
                        >
                          <td className="px-4 py-4 text-slate-500">
                            {pageRange.start + index + 1}
                          </td>
                          <td className="px-4 py-4" onClick={selectRow}>
                            <div className="flex items-center gap-3 text-left">
                              <button
                                type="button"
                                className={`text-base transition ${
                                  favorites.has(row.symbol)
                                    ? "text-amber-300 hover:text-amber-200"
                                    : "text-slate-600 hover:text-slate-300"
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(row.symbol);
                                }}
                                aria-label={`Favorito ${row.symbol}`}
                                title={favorites.has(row.symbol) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                              >
                                {favorites.has(row.symbol) ? "★" : "☆"}
                              </button>
                              <div>
                                <p className="font-semibold text-white">{row.symbol}</p>
                                <p className="text-xs text-slate-500">{row.name}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4 font-semibold text-white">
                            {formatCurrency(row.priceUsd, row.priceUsd < 1 ? 6 : 2)}
                          </td>
                          <td
                            className={`px-4 py-4 font-semibold ${
                              row.change24h >= 0 ? "text-emerald-300" : "text-rose-300"
                            }`}
                          >
                            {formatPercent(row.change24h)}
                          </td>
                          <td className="px-4 py-4 text-slate-300">
                            {row.marketCapUsd ? formatCompact(row.marketCapUsd) : "—"}
                          </td>
                          <td className="px-4 py-4 text-slate-300">
                            {formatCompact(row.volume24hUsd)}
                          </td>
                          <td className="px-4 py-4" onClick={selectRow}>
                            <TrendSparkline
                              change={row.change24h}
                              seed={hashSeed(row.market)}
                              isLight={isLightMode}
                            />
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
