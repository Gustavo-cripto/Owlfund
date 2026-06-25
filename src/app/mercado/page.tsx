"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

import AppShell from "@/components/AppShell";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import {
  traditionalAssets,
  traditionalCategories,
  type TraditionalAsset,
} from "@/lib/traditional/assets";
import {
  loadTraditionalHoldings,
  saveTraditionalHoldings,
  type TraditionalHoldings,
} from "@/lib/traditional/storage";
import {
  loadCryptoHoldings,
  saveCryptoHoldings,
  type CryptoHoldings,
} from "@/lib/crypto/storage";

type MarketRow = {
  market: string;
  symbol: string;
  name: string;
  priceUsd: number;
  change24h: number;
  marketCapUsd: number | null;
  volume24hUsd: number;
};

type TraditionalQuote = {
  symbol: string;
  price: number | null;
  changePercent: number | null;
  volume: number | null;
  updatedAt?: string;
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


function useClassification() {
  const { t } = useLanguage();
  return (value: string) => {
    switch (value) {
      case "Extreme Fear": return t("merc_extreme_fear");
      case "Fear": return t("merc_fear");
      case "Neutral": return t("merc_neutral");
      case "Greed": return t("merc_greed");
      case "Extreme Greed": return t("merc_extreme_greed");
      default: return value;
    }
  };
}

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
  const { t } = useLanguage();
  const mapClass = useClassification();
  const now = points[0];
  const yesterday = points[1];
  const lastWeek = points[7];
  const lastMonth = points[30];
  const selected = selectedSymbol
    ? top10.find((row) => row.symbol === selectedSymbol) ?? null
    : null;
  const [remainingSec, setRemainingSec] = useState<number | null>(timeUntilUpdateSec);

  useEffect(() => {
    setRemainingSec(timeUntilUpdateSec);
  }, [timeUntilUpdateSec]);

  useEffect(() => {
    if (remainingSec == null) return;
    const id = window.setInterval(() => {
      setRemainingSec((prev) => {
        if (prev == null) return prev;
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [remainingSec]);

  const rows = [
    { label: t("merc_now"), point: now },
    { label: t("merc_yesterday"), point: yesterday },
    { label: t("merc_last_week"), point: lastWeek },
    { label: t("merc_last_month"), point: lastMonth },
  ].filter((row) => row.point);

  const updatedAt = now ? formatDateShort(now.timestampSec) : "";

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-start gap-3">
          <div className="text-2xl leading-none">₿</div>
          <div>
            <h2 className="text-base font-semibold text-white">{t("merc_fear_greed")}</h2>
            <p className="text-xs text-slate-500">{t("merc_fear_greed_source")}</p>
          </div>
        </div>

        <div className="mt-4">
          {now ? <FearGreedGauge value={now.value} /> : <div className="h-[140px] w-full animate-pulse rounded-xl bg-slate-950/60" />}
        </div>

        <div className="mt-2">
          <p className="text-sm text-slate-400">{t("merc_now")}:</p>
          <p className="text-lg font-semibold text-white">{now ? mapClass(now.classification) : t("loading")}</p>
          <p className="mt-2 text-xs text-slate-500">
            {updatedAt ? `${t("updated")}: ${updatedAt}` : " "}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="text-sm font-semibold text-white">{t("merc_historical")}</h3>
        <div className="mt-4 flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-slate-200">{row.label}</p>
                <p className="text-xs text-slate-500">
                  {mapClass(row.point!.classification)}
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
        <h3 className="text-sm font-semibold text-white">{t("merc_next_update")}</h3>
        <p className="mt-4 text-sm text-slate-400">{t("merc_next_update_desc")}</p>
        <p className="mt-2 text-lg font-semibold text-white">
          {remainingSec == null ? "—" : formatCountdown(remainingSec)}
        </p>
        <p className="mt-4 text-xs text-slate-500">{t("merc_source")}</p>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white">{t("merc_asset_fg")}</h3>
            <p className="text-xs text-slate-500">
              {selectedSymbol ? `${selectedSymbol} · ${t("merc_estimated_rsi")}` : t("merc_select_asset")}
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
                  ? t("merc_no_data")
                  : t("merc_select_to_view")}
              </p>
            </div>
          )}
        </div>

        {selected && (
          <p className="mt-2 text-sm font-semibold text-white">{selected.label}</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="text-sm font-semibold text-white">Fear &amp; Greed (ETH + Top 10)</h3>
        <p className="mt-1 text-xs text-slate-500">{t("merc_top10")}</p>
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
            <p className="text-sm text-slate-400">{t("loading")}</p>
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
  const { t } = useLanguage();
  const [marketMode, setMarketMode] = useState<"crypto" | "tradicional" | "noticias">("crypto");
  const [newsContent, setNewsContent] = useState<string | null>(null);
  const [newsMode, setNewsMode] = useState<"crypto" | "tradicional">("crypto");
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsDate, setNewsDate] = useState<string | null>(null);
  // Chat de perguntas sobre a análise
  type ChatMsg = { role: "user" | "assistant"; content: string };
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
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
  const [traditionalCategory, setTraditionalCategory] = useState("Todos");
  const [traditionalQuotes, setTraditionalQuotes] = useState<Record<string, TraditionalQuote>>({});
  const [traditionalQuotesError, setTraditionalQuotesError] = useState<string | null>(null);
  const [traditionalQuoteLoading, setTraditionalQuoteLoading] = useState<Record<string, boolean>>(
    {}
  );
  const [selectedTraditional, setSelectedTraditional] = useState<TraditionalAsset | null>(null);
  const [traditionalHoldings, setTraditionalHoldings] = useState<TraditionalHoldings>({});
  const [cryptoHoldings, setCryptoHoldings] = useState<CryptoHoldings>({});
  const [cryptoPnlRange, setCryptoPnlRange] = useState<
    Record<string, "1d" | "30d" | "60d" | "1y">
  >({});
  const [traditionalPnlRange, setTraditionalPnlRange] = useState<
    Record<string, "1d" | "30d" | "60d" | "1y">
  >({});
  const [cryptoSortKey, setCryptoSortKey] = useState<"date" | "marketCap">("date");
  const [cryptoSortDir, setCryptoSortDir] = useState<"asc" | "desc">("desc");
  const [traditionalSortKey, setTraditionalSortKey] = useState<"date" | "marketCap">("date");
  const [traditionalSortDir, setTraditionalSortDir] = useState<"asc" | "desc">("desc");
  const favoritesHydratedRef = useRef(false);
  const traditionalHydratedRef = useRef(false);
  const cryptoHydratedRef = useRef(false);

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

  const refreshTraditionalQuote = async (symbol?: string) => {
    if (!symbol) return;
    setTraditionalQuoteLoading((prev) => ({ ...prev, [symbol]: true }));
    try {
      const response = await fetch(`/api/traditional?symbols=${encodeURIComponent(symbol)}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Falha ao obter cotações.");
      }
      const payload = (await response.json()) as { data: TraditionalQuote[] };
      const quote = payload.data?.[0];
      if (quote) {
        setTraditionalQuotes((prev) => ({ ...prev, [quote.symbol]: quote }));
      }
    } catch (err) {
      setTraditionalQuotesError(err instanceof Error ? err.message : "Erro ao obter dados.");
    } finally {
      setTraditionalQuoteLoading((prev) => ({ ...prev, [symbol]: false }));
    }
  };

  const refreshTraditionalQuotesBatch = async (symbols: string[]) => {
    if (symbols.length === 0) return;
    try {
      const response = await fetch(
        `/api/traditional?symbols=${encodeURIComponent(symbols.join(","))}`
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Falha ao obter cotações.");
      }
      const payload = (await response.json()) as { data: TraditionalQuote[] };
      const next: Record<string, TraditionalQuote> = {};
      payload.data.forEach((quote) => {
        next[quote.symbol] = quote;
      });
      setTraditionalQuotes(next);
    } catch (err) {
      setTraditionalQuotesError(err instanceof Error ? err.message : "Erro ao obter dados.");
    }
  };

  const toggleTraditionalHolding = (assetId: string) => {
    setTraditionalHoldings((prev) => {
      const next = { ...prev };
      if (next[assetId]) {
        delete next[assetId];
      } else {
        next[assetId] = {};
      }
      return next;
    });
  };

  const updateTraditionalHolding = (
    assetId: string,
    next: { buyValue?: number; buyDate?: string }
  ) => {
    setTraditionalHoldings((prev) => {
      const nextHoldings = {
        ...prev,
        [assetId]: {
          ...prev[assetId],
          ...next,
        },
      };
      return nextHoldings;
    });
  };

  const toggleCryptoHolding = (symbol: string) => {
    setCryptoHoldings((prev) => {
      const next = { ...prev };
      if (next[symbol]) {
        delete next[symbol];
      } else {
        next[symbol] = {};
      }
      return next;
    });
  };

  const updateCryptoHolding = (
    symbol: string,
    next: { buyValue?: number; buyDate?: string }
  ) => {
    setCryptoHoldings((prev) => {
      const nextHoldings = {
        ...prev,
        [symbol]: {
          ...prev[symbol],
          ...next,
        },
      };
      return nextHoldings;
    });
  };

  const selectedTraditionalAssets = useMemo(
    () => traditionalAssets.filter((asset) => !!traditionalHoldings[asset.id]),
    [traditionalHoldings]
  );

  const selectedTraditionalQuoteSymbols = useMemo(
    () =>
      selectedTraditionalAssets
        .map((asset) => asset.alphaSymbol)
        .filter((symbol): symbol is string => typeof symbol === "string" && symbol.length > 0),
    [selectedTraditionalAssets]
  );

  useEffect(() => {
    setFavorites(loadFavorites());
    favoritesHydratedRef.current = true;
  }, []);

  useEffect(() => {
    setTraditionalHoldings(loadTraditionalHoldings());
    traditionalHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (marketMode !== "tradicional") return;
    if (selectedTraditionalQuoteSymbols.length === 0) return;
    refreshTraditionalQuotesBatch(selectedTraditionalQuoteSymbols);
    const id = window.setInterval(
      () => refreshTraditionalQuotesBatch(selectedTraditionalQuoteSymbols),
      60000
    );
    return () => window.clearInterval(id);
  }, [marketMode, selectedTraditionalQuoteSymbols]);

  useEffect(() => {
    setCryptoHoldings(loadCryptoHoldings());
    cryptoHydratedRef.current = true;
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
    if (!favoritesHydratedRef.current) return;
    const id = window.setTimeout(() => saveFavorites(favorites), 120);
    return () => window.clearTimeout(id);
  }, [favorites]);

  useEffect(() => {
    if (!traditionalHydratedRef.current) return;
    const id = window.setTimeout(() => saveTraditionalHoldings(traditionalHoldings), 120);
    return () => window.clearTimeout(id);
  }, [traditionalHoldings]);

  useEffect(() => {
    if (!cryptoHydratedRef.current) return;
    const id = window.setTimeout(() => saveCryptoHoldings(cryptoHoldings), 120);
    return () => window.clearTimeout(id);
  }, [cryptoHoldings]);

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
  const traditionalTradingViewInterval = "D";

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

  const visibleTraditionalAssets = useMemo(() => {
    if (traditionalCategory === "Todos") return traditionalAssets;
    return traditionalAssets.filter((asset) => asset.category === traditionalCategory);
  }, [traditionalCategory]);

  const traditionalTotal = useMemo(() => {
    return selectedTraditionalAssets.reduce((sum, asset) => {
      const value = Number(traditionalHoldings[asset.id]?.buyValue ?? 0);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
  }, [selectedTraditionalAssets, traditionalHoldings]);

  const selectedCryptoAssets = useMemo(() => {
    const symbols = Object.keys(cryptoHoldings);
    return rows.filter((row) => symbols.includes(row.symbol));
  }, [rows, cryptoHoldings]);

  const cryptoManualTotal = useMemo(() => {
    return Object.values(cryptoHoldings).reduce((sum, holding) => {
      const value = Number(holding.buyValue ?? 0);
      return Number.isFinite(value) ? sum + value : sum;
    }, 0);
  }, [cryptoHoldings]);

  const sortedSelectedCrypto = useMemo(() => {
    const dir = cryptoSortDir === "asc" ? 1 : -1;
    return [...selectedCryptoAssets].sort((a, b) => {
      if (cryptoSortKey === "date") {
        const ad = cryptoHoldings[a.symbol]?.buyDate ?? "";
        const bd = cryptoHoldings[b.symbol]?.buyDate ?? "";
        return ad.localeCompare(bd) * dir;
      }
      return ((a.marketCapUsd ?? 0) - (b.marketCapUsd ?? 0)) * dir;
    });
  }, [selectedCryptoAssets, cryptoSortDir, cryptoSortKey, cryptoHoldings]);

  const sortedSelectedTraditional = useMemo(() => {
    const dir = traditionalSortDir === "asc" ? 1 : -1;
    return [...selectedTraditionalAssets].sort((a, b) => {
      if (traditionalSortKey === "date") {
        const ad = traditionalHoldings[a.id]?.buyDate ?? "";
        const bd = traditionalHoldings[b.id]?.buyDate ?? "";
        return ad.localeCompare(bd) * dir;
      }
      const aq = a.alphaSymbol ? traditionalQuotes[a.alphaSymbol] : undefined;
      const bq = b.alphaSymbol ? traditionalQuotes[b.alphaSymbol] : undefined;
      const aCap = (aq?.price ?? 0) * (aq?.volume ?? 0);
      const bCap = (bq?.price ?? 0) * (bq?.volume ?? 0);
      return (aCap - bCap) * dir;
    });
  }, [
    selectedTraditionalAssets,
    traditionalSortDir,
    traditionalSortKey,
    traditionalHoldings,
    traditionalQuotes,
  ]);

  const getCryptoPnl = (symbol: string, change24h: number) => {
    const range = cryptoPnlRange[symbol] ?? "1d";
    if (range === "1d") {
      return { label: "1D", value: change24h };
    }
    return { label: range.toUpperCase(), value: null };
  };

  const getTraditionalPnl = (symbol: string, changePercent?: number | null) => {
    const range = traditionalPnlRange[symbol] ?? "1d";
    if (range === "1d") {
      return { label: "1D", value: changePercent ?? null };
    }
    return { label: range.toUpperCase(), value: null };
  };

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
    <AppShell>
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 pb-20 pt-2 lg:px-8">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold text-white">Mercado</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            {marketMode === "crypto"
              ? "Dados em tempo real da CoinEx com comparação entre ativos. Clique em um ativo para abrir o gráfico do TradingView."
              : "Ativos do mercado tradicional com cotações via Alpha Vantage."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMarketMode("crypto")}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                marketMode === "crypto"
                  ? "border-orange-400 bg-orange-500 text-slate-950"
                  : "border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500"
              }`}
            >
              Mercado Crypto
            </button>
            <button
              type="button"
              onClick={() => setMarketMode("tradicional")}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                marketMode === "tradicional"
                  ? "border-orange-400 bg-orange-500 text-slate-950"
                  : "border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500"
              }`}
            >
              Mercado Tradicional
            </button>
            <button
              type="button"
              onClick={() => setMarketMode("noticias")}
              className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                marketMode === "noticias"
                  ? "border-orange-400 bg-orange-500 text-slate-950"
                  : "border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500"
              }`}
            >
              🦉 Notícias IA
            </button>
          </div>
        </div>

        {marketMode === "crypto" ? (
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
                  if (chartSource === "coinglass") {
                    window.open(coinglassUrl, "_blank", "noopener,noreferrer");
                    return;
                  }
                  if (document.fullscreenElement) {
                    document.exitFullscreen();
                    return;
                  }
                  chartRef.current?.requestFullscreen?.();
                }}
              >
                {chartSource === "coinglass" ? "Abrir Coinglass ↗" : isFullscreen ? "Sair do ecrã inteiro" : "Ecrã inteiro"}
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
                key={`tv-${tradingViewSymbol}-${tradingViewInterval}`}
                symbol={tradingViewSymbol}
                interval={tradingViewInterval}
              />
            ) : (
              /* Coinglass doesn't allow iframe embedding — show a curated link page */
              <div className="flex h-full w-full flex-col items-center justify-between gap-6 rounded-xl border border-slate-800 bg-slate-900/40 p-8">
                <div className="flex w-full flex-col items-center gap-4 pt-4">
                  <p className="text-sm font-medium text-slate-300">
                    Abre a Coinglass para ver dados avançados de mercado
                  </p>
                  <a
                    href={coinglassUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-lg transition hover:bg-orange-400"
                  >
                    Abrir Coinglass ↗
                  </a>
                </div>

                <div className="grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: "Liquidações", desc: "Liquidações em tempo real por exchange", path: "/LiquidationData", icon: "🔥" },
                    { label: "Open Interest", desc: "Interesse em aberto por contrato", path: `/openInterest/${selected?.market?.replace("USDT","") ?? "BTC"}`, icon: "📊" },
                    { label: "Funding Rates", desc: "Taxas de financiamento perpétuo", path: "/FundingRate", icon: "💸" },
                    { label: "Long/Short", desc: "Rácio longs vs shorts por exchange", path: "/LongShortRatio", icon: "⚖️" },
                  ].map(({ label, desc, path, icon }) => (
                    <a
                      key={label}
                      href={`https://www.coinglass.com${path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-800/50 p-4 transition hover:border-orange-500/40 hover:bg-slate-800"
                    >
                      <span className="text-2xl">{icon}</span>
                      <span className="text-xs font-semibold text-slate-200 group-hover:text-orange-400">{label} ↗</span>
                      <span className="text-[10px] leading-relaxed text-slate-500">{desc}</span>
                    </a>
                  ))}
                </div>

                <div className="flex w-full max-w-2xl flex-wrap justify-center gap-2 pb-4">
                  {[
                    { label: "Heatmap BTC", path: "/bitcoin-liquidation-heatmap" },
                    { label: "Fear & Greed", path: "/fear-greed-index" },
                    { label: "Basis", path: "/FuturesBasis" },
                    { label: "Volume", path: "/FuturesExchangeVolume" },
                  ].map(({ label, path }) => (
                    <a
                      key={label}
                      href={`https://www.coinglass.com${path}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-slate-700 px-3 py-1 text-[11px] text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
                    >
                      {label} ↗
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
        ) : null}

        {marketMode === "tradicional" && (
          <section className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Mercado Tradicional</h2>
                <p className="text-sm text-slate-400">
                  Seleciona a categoria e atualiza o preço atual por ativo.
                </p>
              </div>
              {traditionalQuotesError ? (
                <p className="text-xs text-rose-300">{traditionalQuotesError}</p>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {traditionalCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setTraditionalCategory(category)}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${
                    traditionalCategory === category
                      ? "border-orange-400 bg-orange-500 text-slate-950"
                      : "border-slate-700 bg-slate-950/60 text-slate-200 hover:border-slate-500"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {visibleTraditionalAssets.map((asset) => {
                const quote = asset.alphaSymbol ? traditionalQuotes[asset.alphaSymbol] : undefined;
                const isQuoteLoading = asset.alphaSymbol
                  ? !!traditionalQuoteLoading[asset.alphaSymbol]
                  : false;
                const isSelected = selectedTraditional?.id === asset.id;
                const isInPortfolio = !!traditionalHoldings[asset.id];
                return (
                  <div
                    key={asset.id}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm text-slate-100 transition ${
                      isSelected
                        ? "border-orange-400/60 bg-orange-500/10"
                        : "border-slate-800 bg-slate-950/60 hover:border-slate-600"
                    }`}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTraditional(asset)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedTraditional(asset);
                      }
                    }}
                  >
                    <div>
                      <p className="font-semibold text-white">{asset.label}</p>
                      <p className="text-xs text-slate-500">{asset.category}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleTraditionalHolding(asset.id);
                        }}
                        className={`rounded-full border px-3 py-2 text-[11px] font-semibold transition ${
                          isInPortfolio
                            ? "border-emerald-400/50 text-emerald-200 hover:border-emerald-400"
                            : "border-slate-700 text-slate-200 hover:border-slate-500 hover:text-white"
                        }`}
                      >
                        {isInPortfolio ? "Na carteira" : "Adicionar"}
                      </button>
                      <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                        Preço:{" "}
                        <span className="font-semibold text-white">
                          {quote?.price != null ? quote.price.toFixed(2) : "—"}
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          refreshTraditionalQuote(asset.alphaSymbol);
                        }}
                        disabled={!asset.alphaSymbol || isQuoteLoading}
                        className="rounded-full border border-orange-400/40 px-3 py-2 text-[11px] font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isQuoteLoading ? "A atualizar..." : "Atualizar preço"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                    Carteira Tradicional
                  </p>
                  <p className="text-sm text-slate-400">
                    {selectedTraditionalAssets.length
                      ? "Define o valor de compra e a data por ativo."
                      : "Seleciona ativos para criar a carteira tradicional."}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Total</p>
                  <p className="text-lg font-semibold text-white">
                    € {traditionalTotal.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <select
                  value={traditionalSortKey}
                  onChange={(event) =>
                    setTraditionalSortKey(event.target.value as "date" | "marketCap")
                  }
                  className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 outline-none"
                >
                  <option value="date">Data de compra</option>
                  <option value="marketCap">Market cap</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setTraditionalSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
                  }
                  className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                >
                  {traditionalSortDir === "asc" ? "Asc" : "Desc"}
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {sortedSelectedTraditional.length === 0 ? (
                  <p className="text-sm text-slate-500">Nenhum ativo selecionado.</p>
                ) : (
                  sortedSelectedTraditional.map((asset) => {
                    const holding = traditionalHoldings[asset.id] ?? {};
                    const quote = asset.alphaSymbol
                      ? traditionalQuotes[asset.alphaSymbol]
                      : undefined;
                    const isQuoteLoading = asset.alphaSymbol
                      ? !!traditionalQuoteLoading[asset.alphaSymbol]
                      : false;
                    return (
                      <div
                        key={asset.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-100"
                      >
                        <div>
                          <p className="font-semibold text-white">{asset.label}</p>
                          <p className="text-slate-500">{asset.category}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            placeholder="Valor de compra"
                            value={holding.buyValue ?? ""}
                            onChange={(event) => {
                              const value = event.target.value;
                              updateTraditionalHolding(asset.id, {
                                buyValue: value === "" ? undefined : Number(value),
                              });
                            }}
                            className="w-40 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                          />
                          <input
                            type="date"
                            value={holding.buyDate ?? ""}
                            onChange={(event) =>
                              updateTraditionalHolding(asset.id, { buyDate: event.target.value })
                            }
                            className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                          />
                          <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                            Preço atual:{" "}
                            <span className="font-semibold text-white">
                              {quote?.price != null ? quote.price.toFixed(2) : "—"}
                            </span>
                          </span>
                          <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                            <select
                              value={traditionalPnlRange[asset.id] ?? "1d"}
                              onChange={(event) =>
                                setTraditionalPnlRange((prev) => ({
                                  ...prev,
                                  [asset.id]: event.target.value as "1d" | "30d" | "60d" | "1y",
                                }))
                              }
                              className="bg-transparent text-xs text-slate-200 outline-none"
                            >
                              <option value="1d">Diário</option>
                              <option value="30d">30 dias</option>
                              <option value="60d">60 dias</option>
                              <option value="1y">Anual</option>
                            </select>
                            {(() => {
                              const pnl = getTraditionalPnl(asset.id, quote?.changePercent ?? null);
                              const value = pnl.value;
                              return (
                                <span
                                  className={
                                    value == null
                                      ? "text-slate-400"
                                      : value >= 0
                                        ? "text-emerald-300"
                                        : "text-rose-300"
                                  }
                                >
                                  {value == null ? "—" : formatPercent(value)}
                                </span>
                              );
                            })()}
                          </div>
                          <button
                            type="button"
                            onClick={() => refreshTraditionalQuote(asset.alphaSymbol)}
                            disabled={!asset.alphaSymbol || isQuoteLoading}
                            className="rounded-full border border-orange-400/40 px-3 py-2 text-[11px] font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isQuoteLoading ? "A atualizar..." : "Atualizar preço"}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleTraditionalHolding(asset.id)}
                            className="rounded-full border border-slate-700 px-3 py-2 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Gráfico</p>
                  <p className="text-sm text-slate-400">
                    {selectedTraditional
                      ? selectedTraditional.label
                      : "Selecione um ativo para ver o gráfico"}
                  </p>
                </div>
              </div>
              <div className="mt-4 h-[420px] rounded-xl border border-slate-800 bg-slate-950/50 p-2">
                {selectedTraditional?.tvSymbol ? (
                  <TradingViewWidget
                    key={`${selectedTraditional.tvSymbol}-${traditionalTradingViewInterval}`}
                    symbol={selectedTraditional.tvSymbol}
                    interval={traditionalTradingViewInterval}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    Sem símbolo disponível para este ativo.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {marketMode === "crypto" ? (
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
                        <th className="px-4 py-3" title="Variação de preço nos últimos 7 dias">Tendência (7d)</th>
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
        ) : null}

        {/* ── NOTÍCIAS IA ── */}
        {marketMode === "noticias" && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-orange-400">Briefing Diário</p>
                <h2 className="text-lg font-bold text-white mt-1">Análise de Mercado com IA</h2>
                <p className="text-sm text-slate-400 mt-0.5">Powered by Groq · Relatório gerado por IA com base no contexto de mercado</p>
              </div>

              {/* Tabs crypto/tradicional */}
              <div className="flex gap-2">
                {(["crypto", "tradicional"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setNewsMode(m)}
                    className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                      newsMode === m
                        ? "border-orange-400 bg-orange-500/20 text-orange-200"
                        : "border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    {m === "crypto" ? "Cripto" : "Tradicional"}
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={newsLoading}
                onClick={async () => {
                  setNewsLoading(true);
                  setNewsError(null);
                  setNewsContent(null);
                  setChatMessages([]);
                  try {
                    const res = await fetch("/api/market-news", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ mode: newsMode }),
                    });
                    const data = await res.json() as { content?: string; error?: string; date?: string };
                    if (!res.ok || data.error) { setNewsError(data.error ?? "Erro"); return; }
                    setNewsContent(data.content ?? "");
                    setNewsDate(data.date ?? null);
                  } catch (err) {
                    setNewsError(err instanceof Error ? err.message : "Erro");
                  } finally {
                    setNewsLoading(false);
                  }
                }}
                className="rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-bold text-slate-950 hover:bg-orange-400 disabled:opacity-50 transition"
              >
                {newsLoading ? "A gerar briefing…" : "Gerar Briefing Diário"}
              </button>

              {newsError && <p className="text-sm text-rose-400">{newsError}</p>}

              {newsContent && (
                <>
                  <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500">{newsMode === "crypto" ? "Cripto" : "Mercado Tradicional"} · {newsDate}</p>
                      <span className="text-xs text-orange-400 font-semibold">🦉 Owlfund AI</span>
                    </div>
                    <div className="prose prose-sm prose-invert max-w-none">
                      {newsContent.split("\n").map((line, i) => {
                        if (line.startsWith("## ")) {
                          return <h3 key={i} className="text-base font-bold text-white mt-4 mb-2">{line.replace("## ", "")}</h3>;
                        }
                        if (line.startsWith("- ") || line.startsWith("• ")) {
                          return <p key={i} className="text-sm text-slate-300 pl-3 border-l border-orange-500/30 my-1">{line.replace(/^[-•] /, "")}</p>;
                        }
                        if (line.trim() === "") return <div key={i} className="h-1" />;
                        return <p key={i} className="text-sm text-slate-300 leading-relaxed">{line}</p>;
                      })}
                    </div>
                  </div>

                  {/* Chat de perguntas sobre a análise */}
                  <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-5 space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="text-base">💬</span>
                      <div>
                        <p className="text-sm font-semibold text-white">Perguntas sobre esta análise</p>
                        <p className="text-xs text-slate-400">Podes fazer perguntas sobre o briefing gerado</p>
                      </div>
                    </div>

                    {/* Histórico de mensagens */}
                    {chatMessages.length > 0 && (
                      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                        {chatMessages.map((msg, i) => (
                          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm ${
                              msg.role === "user"
                                ? "bg-orange-500/20 border border-orange-500/30 text-orange-100"
                                : "bg-slate-800 border border-slate-700 text-slate-200"
                            }`}>
                              {msg.role === "assistant" && (
                                <p className="text-[10px] text-orange-400 font-semibold mb-1">🦉 Owlfund AI</p>
                              )}
                              <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            </div>
                          </div>
                        ))}
                        {chatLoading && (
                          <div className="flex justify-start">
                            <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5">
                              <p className="text-[10px] text-orange-400 font-semibold mb-1">🦉 Owlfund AI</p>
                              <div className="flex gap-1 items-center h-4">
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:0ms]"/>
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:150ms]"/>
                                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:300ms]"/>
                              </div>
                            </div>
                          </div>
                        )}
                        <div ref={chatEndRef} />
                      </div>
                    )}

                    {/* Input */}
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const q = chatInput.trim();
                        if (!q || chatLoading) return;
                        const newMessages: ChatMsg[] = [...chatMessages, { role: "user", content: q }];
                        setChatMessages(newMessages);
                        setChatInput("");
                        setChatLoading(true);
                        setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
                        try {
                          const res = await fetch("/api/market-chat", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              briefing: newsContent,
                              mode: newsMode,
                              messages: newMessages,
                            }),
                          });
                          const data = await res.json() as { reply?: string; error?: string };
                          const reply = data.reply ?? data.error ?? "Erro ao obter resposta.";
                          setChatMessages(prev => [...prev, { role: "assistant", content: reply }]);
                        } catch {
                          setChatMessages(prev => [...prev, { role: "assistant", content: "Erro de ligação. Tenta novamente." }]);
                        } finally {
                          setChatLoading(false);
                          setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
                        }
                      }}
                      className="flex gap-2"
                    >
                      <input
                        type="text"
                        value={chatInput}
                        onChange={e => setChatInput(e.target.value)}
                        placeholder="Ex: O que achas do BTC a curto prazo? Por que está o Fear & Greed baixo?"
                        disabled={chatLoading}
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={chatLoading || !chatInput.trim()}
                        className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-orange-400 disabled:opacity-40 transition"
                      >
                        Enviar
                      </button>
                    </form>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
    </AppShell>
  );
}
