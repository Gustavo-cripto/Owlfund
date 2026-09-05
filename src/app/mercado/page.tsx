"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { btnPrimary } from "@/lib/ui/buttons";

import AppShell from "@/components/AppShell";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { loadNickname } from "@/lib/user/nickname";
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
  id?: string | null;
  priceUsd: number;
  change1h: number | null;
  change24h: number;
  change7d: number | null;
  change30d: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number;
  sparkline?: number[];
};

type Candle = { t: number; o: number; h: number; l: number; c: number; vol: number };
type DerivData = {
  symbol: string;
  oi: { t: number; v: number }[];
  longShort: { t: number; buy: number; sell: number }[];
  funding: { t: number; v: number }[];
  cvd: { t: number; v: number }[];
  taker: { t: number; buy: number; sell: number }[];
  candles: Candle[];
  putCall: { t: number; oi: number; vol: number }[];
  score: number;
  rsi: number | null;
  components?: { longShort: number; taker: number; rsi: number; cvd: number; funding: number; putCall: number };
  missing?: string[];
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

// Locale de UI a partir de <html lang> (o LanguageContext mantém-no em sincronia).
const uiLocale = () => {
  const l = typeof document !== "undefined" ? document.documentElement.lang : "pt";
  return ({ pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" } as Record<string, string>)[l] ?? "pt-PT";
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
    return new Date(timestampSec * 1000).toLocaleDateString(uiLocale(), {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return "";
  }
};


function useClassification() {
  const { t, lang } = useLanguage();
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
  selectedSymbol,
  communitySentiment,
}: {
  points: FearGreedPoint[];
  timeUntilUpdateSec: number | null;
  selectedSymbol: string | null;
  communitySentiment?: { up: number | null; down: number | null } | null;
}) {
  const { t, lang } = useLanguage();
  const mapClass = useClassification();
  const now = points[0];
  const yesterday = points[1];
  const lastWeek = points[7];
  const lastMonth = points[30];
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingSec == null]);

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

        {points.length > 2 && (() => {
          // Velas diárias do Fear & Greed: como só há 1 valor por dia, usa-se a
          // técnica padrão — abertura = valor de ontem, fecho = valor de hoje.
          // O corpo = variação do dia (verde sobe / vermelho desce); sem pavios.
          const series = [...points].reverse(); // mais antigo → mais recente
          const fgCandles: Candle[] = [];
          for (let i = 1; i < series.length; i++) {
            const o = series[i - 1].value;
            const c = series[i].value;
            fgCandles.push({
              t: series[i].timestampSec,
              o, c,
              h: Math.max(o, c),
              l: Math.min(o, c),
              vol: 0,
            });
          }
          return (
            <div className="mt-4">
              <CandleChart candles={fgCandles} showVolume={false} heightClass="h-24" />
              <div className="mt-1 flex justify-between text-[10px] text-slate-500">
                <span>{fgCandles.length}d</span>
                <span>{t("merc_now")}</span>
              </div>
            </div>
          );
        })()}

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

      {selectedSymbol && communitySentiment?.up != null && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-white">{t("mc_community_sentiment")}</span>
            <span className="text-xs text-slate-500">{selectedSymbol} · CoinGecko</span>
          </div>
          <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-800">
            <div className="bg-emerald-500" style={{ width: `${communitySentiment.up}%` }} />
            <div className="bg-rose-500" style={{ width: `${communitySentiment.down ?? 100 - communitySentiment.up}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-xs font-semibold">
            <span className="text-emerald-400">▲ {Math.round(communitySentiment.up)}%</span>
            <span className="text-rose-400">{Math.round(communitySentiment.down ?? 100 - communitySentiment.up)}% ▼</span>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h3 className="text-sm font-semibold text-white">{t("merc_next_update")}</h3>
        <p className="mt-4 text-sm text-slate-400">{t("merc_next_update_desc")}</p>
        <p className="mt-2 text-lg font-semibold text-white">
          {remainingSec == null ? "—" : formatCountdown(remainingSec)}
        </p>
        <p className="mt-4 text-xs text-slate-500">{t("merc_source")}</p>
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

// Normaliza preços reais (sparkline_in_7d) para o viewBox 100×20 da mini-tabela.
const realSparklinePoints = (prices: number[]): string => {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  return prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * 100;
      const y = 18 - ((p - min) / range) * 16; // 2..18, mais alto = mais em cima
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
};

function TrendSparkline({
  change,
  seed,
  isLight,
  prices,
}: {
  change: number;
  seed: number;
  isLight: boolean;
  prices?: number[];
}) {
  const hasReal = Array.isArray(prices) && prices.length >= 2;
  const isUp = hasReal ? prices![prices!.length - 1] >= prices![0] : change >= 0;
  const upColor = "#22c55e";
  const downColor = "#ef4444";
  const outlineColor = "#0f172a";
  const points = hasReal ? realSparklinePoints(prices!) : buildSparkline(change, seed);
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

function CandleChart({ candles, showVolume = true, heightClass = "h-48" }: { candles: Candle[]; showVolume?: boolean; heightClass?: string }) {
  if (!candles || candles.length < 2) return <div className={`${heightClass} w-full rounded bg-slate-950/40`} />;
  const max = Math.max(...candles.map((c) => c.h));
  const min = Math.min(...candles.map((c) => c.l));
  const range = max - min || 1;
  const maxVol = Math.max(...candles.map((c) => c.vol)) || 1;
  const W = 300, H = 150;
  const volH = showVolume ? 34 : 0;
  const gap = showVolume ? 6 : 0;
  const priceH = H - volH - gap;
  const n = candles.length;
  const cw = W / n;
  const y = (p: number) => priceH - ((p - min) / range) * priceH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`${heightClass} w-full`} preserveAspectRatio="none" aria-hidden>
      {candles.map((c, i) => {
        const x = i * cw + cw / 2;
        const up = c.c >= c.o;
        const color = up ? "#22c55e" : "#ef4444";
        const bodyTop = y(Math.max(c.o, c.c));
        const bodyH = Math.max(0.6, y(Math.min(c.o, c.c)) - bodyTop);
        const vh = (c.vol / maxVol) * volH;
        return (
          <g key={c.t}>
            <line x1={x} y1={y(c.h)} x2={x} y2={y(c.l)} stroke={color} strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
            <rect x={i * cw + cw * 0.18} y={bodyTop} width={cw * 0.64} height={bodyH} fill={color} />
            {showVolume && <rect x={i * cw + cw * 0.18} y={priceH + gap + (volH - vh)} width={cw * 0.64} height={vh} fill={color} opacity="0.4" />}
          </g>
        );
      })}
    </svg>
  );
}

function DerivMiniChart({ values, color, id }: { values: number[]; color: string; id: string }) {
  if (!values || values.length < 2) return <div className="h-16 w-full rounded bg-slate-950/40" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 120, H = 48;
  const coords = values.map((v, i) => [(i / (values.length - 1)) * W, H - ((v - min) / range) * H] as const);
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;
  const baseY = H - ((values[0] - min) / range) * H; // referência = primeiro valor
  const last = coords[coords.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1={baseY} x2={W} y2={baseY} stroke="#475569" strokeWidth="0.5" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.2" fill={color} />
    </svg>
  );
}

type Liq = { id: number; side: "long" | "short"; usd: number; price: number; t: number };
function LiquidationsFeed({ symbol }: { symbol: string }) {
  const { t } = useLanguage();
  const [liqs, setLiqs] = useState<Liq[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");

  useEffect(() => {
    setLiqs([]);
    setStatus("connecting");
    const sym = `${symbol.toLowerCase()}usdt`;
    let ws: WebSocket | null = null;
    let idc = 0;
    try {
      ws = new WebSocket(`wss://fstream.binance.com/ws/${sym}@forceOrder`);
      ws.onopen = () => setStatus("live");
      ws.onerror = () => setStatus("error");
      ws.onclose = () => setStatus("error");
      ws.onmessage = (ev: MessageEvent) => {
        try {
          const m = JSON.parse(ev.data as string) as { o?: { S?: string; q?: string; p?: string; ap?: string; T?: number } };
          const o = m?.o;
          if (!o) return;
          const qty = Number(o.q ?? 0);
          const price = Number(o.ap ?? o.p ?? 0);
          if (!(qty > 0) || !(price > 0)) return;
          const side: "long" | "short" = o.S === "SELL" ? "long" : "short"; // SELL forceOrder = long liquidado
          setLiqs((prev) => [{ id: idc++, side, usd: qty * price, price, t: Number(o.T) || Date.now() }, ...prev].slice(0, 12));
        } catch { /* ignora mensagens inválidas */ }
      };
    } catch {
      setStatus("error");
    }
    return () => { try { ws?.close(); } catch { /* noop */ } };
  }, [symbol]);

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">🔥 {t("mc_liq_live")}</p>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${status === "live" ? "bg-emerald-400" : status === "error" ? "bg-rose-400" : "bg-amber-400 animate-pulse"}`} />
          <a href={`https://www.coinglass.com/LiquidationData`} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-orange-300 hover:text-orange-200">Coinglass ↗</a>
        </div>
      </div>
      <div className="mt-3 max-h-40 space-y-1 overflow-y-auto">
        {liqs.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-slate-500">
            {status === "error" ? t("mc_liq_note") : t("mc_liq_waiting")}
          </p>
        ) : (
          liqs.map((l) => (
            <div key={l.id} className="flex items-center justify-between rounded-md bg-slate-950/40 px-2.5 py-1.5 text-[11px]">
              <span className={`font-semibold ${l.side === "long" ? "text-rose-400" : "text-emerald-400"}`}>
                {l.side === "long" ? t("mc_long") : t("mc_short")}
              </span>
              <span className="font-mono text-slate-200">${l.usd >= 1000 ? `${(l.usd / 1000).toFixed(1)}k` : l.usd.toFixed(0)}</span>
              <span className="text-slate-500">@ ${l.price.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DerivativesPanel({ data, loading, symbol, updatedAt, error, onRefresh }: { data: DerivData | null; loading: boolean; symbol: string; updatedAt?: number | null; error?: boolean; onRefresh?: () => void }) {
  const { t } = useLanguage();
  const oiVals = (data?.oi ?? []).map((p) => p.v);
  const cvdVals = (data?.cvd ?? []).map((p) => p.v);
  const fundingVals = (data?.funding ?? []).map((p) => p.v);
  const latestLs = data?.longShort?.[data.longShort.length - 1];
  const latestOi = oiVals[oiVals.length - 1];
  const latestCvd = cvdVals[cvdVals.length - 1];
  const latestFunding = fundingVals[fundingVals.length - 1];
  const cvdUp = cvdVals.length > 1 ? cvdVals[cvdVals.length - 1] >= cvdVals[0] : true;
  const latestTaker = data?.taker?.[data.taker.length - 1];
  const takerBuyPct = latestTaker && latestTaker.buy + latestTaker.sell > 0
    ? (latestTaker.buy / (latestTaker.buy + latestTaker.sell)) * 100 : null;
  const pcVals = (data?.putCall ?? []).map((p) => p.oi);
  const latestPc = pcVals[pcVals.length - 1];
  const compact = (n: number | undefined) =>
    n == null || Number.isNaN(n) ? "—" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/40 p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-400">{t("mc_deriv_data")}</p>
          <h3 className="mt-0.5 text-base font-bold text-white">{symbol} · <span className="text-sm font-normal text-slate-400">OKX</span></h3>
          <p className="mt-1 text-[11px] text-slate-500">
            {updatedAt ? `${t("updated")}: ${new Date(updatedAt).toLocaleTimeString(uiLocale(), { hour: "2-digit", minute: "2-digit" })}` : ""}
            {onRefresh && (
              <button type="button" onClick={onRefresh} disabled={loading} className="ml-2 text-orange-300 hover:text-orange-200 disabled:opacity-50">↻ {t("mc_refresh")}</button>
            )}
          </p>
          {error && <p className="mt-1 text-xs text-amber-300">⚠️ {t("mc_deriv_fail")}</p>}
        </div>
        <a href="https://www.coinglass.com" target="_blank" rel="noopener noreferrer"
          className="rounded-full border border-orange-500/40 bg-orange-500/10 px-4 py-1.5 text-xs font-semibold text-orange-300 transition hover:bg-orange-500/20">
          {t("mc_open_coinglass")}
        </a>
      </div>

      {data && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">{t("mc_sentiment_score")}</p>
            <p className={`text-lg font-bold ${data.score >= 55 ? "text-emerald-300" : data.score <= 45 ? "text-rose-300" : "text-slate-200"}`}>{data.score}/100</p>
          </div>
          <div className="mt-2"><FearGreedGauge value={data.score} /></div>
          <p className={`mt-1 text-center text-xs font-semibold ${data.score >= 55 ? "text-emerald-400" : data.score <= 45 ? "text-rose-400" : "text-slate-400"}`}>
            {data.score >= 55 ? t("mc_score_bull") : data.score <= 45 ? t("mc_score_bear") : t("mc_score_neutral")}
          </p>
          <details className="mt-2 rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-semibold text-orange-300">❓ {t("mc_score_what")}</summary>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{t("mc_score_explain")}</p>
            {data.components && (
              <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-300 sm:grid-cols-3">
                {([
                  ["Long/Short", data.components.longShort], ["Taker", data.components.taker], ["RSI", data.components.rsi],
                  ["CVD", data.components.cvd], ["Funding", data.components.funding], ["Put/Call", data.components.putCall],
                ] as [string, number][]).map(([k, v]) => (
                  <li key={k} className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">{k}</span>
                    <span className={`font-semibold tabular-nums ${v >= 55 ? "text-emerald-400" : v <= 45 ? "text-rose-400" : "text-slate-300"}`}>
                      {v >= 55 ? "↑" : v <= 45 ? "↓" : "→"} {Math.round(v)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {data.missing && data.missing.length > 0 && (
              <p className="mt-1.5 text-[10px] text-slate-500">{t("mc_score_missing")}: {data.missing.join(", ")}</p>
            )}
            <p className="mt-1.5 text-[10px] text-slate-600">{t("mc_score_disclaimer")}</p>
          </details>
        </div>
      )}

      {data && data.candles.length > 1 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-3">
          <div className="mb-1 flex items-center justify-between px-1">
            <p className="text-xs font-semibold text-slate-300">{symbol}/USDT · 1H</p>
            <p className="text-[10px] text-slate-500">OKX</p>
          </div>
          <CandleChart candles={data.candles} />
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-800/40" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Open Interest */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <div className="flex items-center justify-between">
              <a href={`https://www.coinglass.com/openInterest/${symbol}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-white transition hover:text-orange-300">📊 {t("mc_oi")} ↗</a>
              <p className="text-sm font-bold text-blue-300">{compact(latestOi)}</p>
            </div>
            <div className="mt-3"><DerivMiniChart values={oiVals} color="#3b82f6" id="oi-real-grad" /></div>
            <p className="mt-2 text-[11px] text-slate-500">{t("mc_oi_desc")}</p>
          </div>

          {/* Long/Short */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <div className="flex items-center justify-between">
              <a href="https://www.coinglass.com/LongShortRatio" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-white transition hover:text-orange-300">⚖️ {t("mc_longshort")} ↗</a>
              <p className="text-sm font-bold text-slate-200">{latestLs ? `${latestLs.buy.toFixed(0)}/${latestLs.sell.toFixed(0)}` : "—"}</p>
            </div>
            {latestLs ? (
              <>
                <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-800">
                  <div className="bg-emerald-500" style={{ width: `${latestLs.buy}%` }} />
                  <div className="bg-rose-500" style={{ width: `${latestLs.sell}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[11px] font-semibold">
                  <span className="text-emerald-400">{t("mc_long")} {latestLs.buy.toFixed(1)}%</span>
                  <span className="text-rose-400">{latestLs.sell.toFixed(1)}% {t("mc_short")}</span>
                </div>
              </>
            ) : <div className="mt-3 h-12" />}
            <p className="mt-2 text-[11px] text-slate-500">{t("mc_longshort_desc")}</p>
          </div>

          {/* Funding */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <div className="flex items-center justify-between">
              <a href="https://www.coinglass.com/FundingRate" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-white transition hover:text-orange-300">💸 {t("mc_funding")} ↗</a>
              <p className={`text-sm font-bold ${latestFunding == null ? "text-slate-400" : latestFunding >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                {latestFunding == null ? "—" : `${latestFunding >= 0 ? "+" : ""}${latestFunding.toFixed(4)}%`}
              </p>
            </div>
            <div className="mt-3"><DerivMiniChart values={fundingVals} color={latestFunding != null && latestFunding < 0 ? "#ef4444" : "#22c55e"} id="funding-real-grad" /></div>
            <p className="mt-2 text-[11px] text-slate-500">{t("mc_funding_desc")}</p>
          </div>

          {/* CVD */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">🌊 CVD</p>
              <p className={`text-sm font-bold ${cvdUp ? "text-emerald-300" : "text-rose-300"}`}>{compact(latestCvd)}</p>
            </div>
            <div className="mt-3"><DerivMiniChart values={cvdVals} color={cvdUp ? "#22c55e" : "#ef4444"} id="cvd-real-grad" /></div>
            <p className="mt-2 text-[11px] text-slate-500">{t("mc_cvd_desc")}</p>
          </div>

          {/* Taker buy/sell */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">🅣 {t("mc_taker")}</p>
              <p className="text-sm font-bold text-slate-200">{takerBuyPct == null ? "—" : `${takerBuyPct.toFixed(0)}/${(100 - takerBuyPct).toFixed(0)}`}</p>
            </div>
            {takerBuyPct != null ? (
              <>
                <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-800">
                  <div className="bg-emerald-500" style={{ width: `${takerBuyPct}%` }} />
                  <div className="bg-rose-500" style={{ width: `${100 - takerBuyPct}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[11px] font-semibold">
                  <span className="text-emerald-400">{t("mc_buy")} {takerBuyPct.toFixed(1)}%</span>
                  <span className="text-rose-400">{(100 - takerBuyPct).toFixed(1)}% {t("mc_sell")}</span>
                </div>
              </>
            ) : <div className="mt-3 h-12" />}
            <p className="mt-2 text-[11px] text-slate-500">{t("mc_taker_desc")}</p>
          </div>

          {/* Put/Call Ratio (opções) */}
          <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-white">🎯 {t("mc_putcall")}</p>
              <p className={`text-sm font-bold ${latestPc == null ? "text-slate-400" : latestPc < 1 ? "text-emerald-300" : "text-rose-300"}`}>
                {latestPc == null ? "—" : latestPc.toFixed(2)}
              </p>
            </div>
            <div className="mt-3"><DerivMiniChart values={pcVals} color={latestPc != null && latestPc < 1 ? "#22c55e" : "#ef4444"} id="pc-real-grad" /></div>
            <p className="mt-2 text-[11px] text-slate-500">{t("mc_putcall_desc")}</p>
          </div>
        </div>
      )}

      {/* Liquidações ao vivo (websocket, corre no browser do utilizador) */}
      <LiquidationsFeed symbol={symbol} />
    </div>
  );
}

export default function MercadoPage() {
  useRequireAuth("/login");
  const { t, lang } = useLanguage();
  const { format: fmtCur } = useCurrencyFormat();
  const [userPlan, setUserPlan] = useState<"unknown" | "free" | "pro" | "premium">("unknown");
  useEffect(() => {
    fetch("/api/subscription").then(r => r.json()).then((d: { plan?: string }) => {
      if (d.plan === "premium") setUserPlan("premium");
      else if (d.plan === "pro") setUserPlan("pro");
      else setUserPlan("free");
    }).catch(() => setUserPlan("free"));
  }, []);
  // Durante o beta (pagamentos congelados) os CTAs de upgrade viram convite ao beta.
  const paymentsFrozen = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== "true";
  const [marketMode, setMarketMode] = useState<"crypto" | "tradicional" | "noticias">("crypto");
  const [newsContent, setNewsContent] = useState<string | null>(null);
  const [newsMode, setNewsMode] = useState<"crypto" | "tradicional" | "diarias">("crypto");
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState<string | null>(null);
  const [newsDate, setNewsDate] = useState<string | null>(null);
  type NewsItem = { title: string; link: string; description: string; pubDate: string; source: string; image?: string; category?: string };
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsItemsLoading, setNewsItemsLoading] = useState(false);
  const [newsItemsError, setNewsItemsError] = useState(false);
  const [newsBriefing, setNewsBriefing] = useState<string | null>(null);
  const [newsBriefingLoading, setNewsBriefingLoading] = useState(false);
  const [newsBriefingError, setNewsBriefingError] = useState<string | null>(null);
  const [newsBriefingDate, setNewsBriefingDate] = useState<string | null>(null);
  // Chat de perguntas sobre a análise
  type ChatMsg = { role: "user" | "assistant"; content: string };
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<MarketRow[]>([]);
  const [selected, setSelected] = useState<MarketRow | null>(null);
  const [marketGlobal, setMarketGlobal] = useState<{
    totalMarketCapUsd: number | null; marketCapChange24h: number | null;
    btcDominance: number | null; ethDominance: number | null;
  } | null>(null);
  const [communitySentiment, setCommunitySentiment] = useState<{ up: number | null; down: number | null } | null>(null);
  const sentimentCacheRef = useRef<Record<string, { up: number | null; down: number | null }>>({});
  const [derivatives, setDerivatives] = useState<DerivData | null>(null);
  const [derivativesLoading, setDerivativesLoading] = useState(false);
  const derivativesCacheRef = useRef<Record<string, { d: DerivData; at: number }>>({});
  const [derivativesAt, setDerivativesAt] = useState<number | null>(null);
  const [derivativesError, setDerivativesError] = useState(false);
  const [derivativesTick, setDerivativesTick] = useState(0); // força refresh manual
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
  const [fearGreedError, setFearGreedError] = useState(false);
  const [fearGreedTick, setFearGreedTick] = useState(0);
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
          global?: {
            totalMarketCapUsd: number | null; marketCapChange24h: number | null;
            btcDominance: number | null; ethDominance: number | null;
          } | null;
          error?: string;
        };
        if (!response.ok || !data.data) {
          throw new Error(data.error ?? t("mc_err_markets"));
        }
        setRows(data.data);
        setSelected(data.data[0] ?? null);
        setSentimentTop10(data.sentimentTop10 ?? []);
        setMarketGlobal(data.global ?? null);
        setPage(0);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("mc_err_markets2"));
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  // Sentimento da comunidade (CoinGecko) do ativo selecionado, com cache por id.
  useEffect(() => {
    const id = selected?.id;
    if (!id) { setCommunitySentiment(null); return; }
    const cached = sentimentCacheRef.current[id];
    if (cached) { setCommunitySentiment(cached); return; }
    let cancelled = false;
    fetch(`/api/coin-sentiment?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d: { up?: number | null; down?: number | null }) => {
        if (cancelled) return;
        const v = { up: d.up ?? null, down: d.down ?? null };
        sentimentCacheRef.current[id] = v;
        setCommunitySentiment(v);
      })
      .catch(() => { if (!cancelled) setCommunitySentiment(null); });
    return () => { cancelled = true; };
  }, [selected?.id]);

  // Derivados nativos (Bybit + OKX) do ativo selecionado, quando a aba Coinglass está ativa.
  useEffect(() => {
    if (chartSource !== "coinglass") return;
    const base = selected?.symbol ?? "BTC";
    const cached = derivativesCacheRef.current[base];
    const FRESH_MS = 5 * 60_000;
    if (cached && Date.now() - cached.at < FRESH_MS && derivativesTick === 0) {
      setDerivatives(cached.d); setDerivativesAt(cached.at); setDerivativesError(false); return;
    }
    let cancelled = false;
    setDerivatives(null); // nunca mostrar a moeda anterior com o título da nova
    setDerivativesError(false);
    setDerivativesLoading(true);
    fetch(`/api/derivatives?symbol=${encodeURIComponent(base)}`)
      .then(async (r) => {
        const d = (await r.json()) as DerivData & { error?: string };
        if (!r.ok || d.error || !Array.isArray(d.longShort)) throw new Error(d.error ?? "derivatives");
        return d;
      })
      .then((d: DerivData) => {
        if (cancelled) return;
        const at = Date.now();
        derivativesCacheRef.current[base] = { d, at };
        setDerivatives(d); setDerivativesAt(at);
      })
      .catch(() => { if (!cancelled) { setDerivatives(null); setDerivativesError(true); } })
      .finally(() => { if (!cancelled) setDerivativesLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartSource, selected?.symbol, derivativesTick]);

  const refreshTraditionalQuote = async (symbol?: string) => {
    if (!symbol) return;
    setTraditionalQuoteLoading((prev) => ({ ...prev, [symbol]: true }));
    try {
      const response = await fetch(`/api/traditional?symbols=${encodeURIComponent(symbol)}`);
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? t("mc_err_quotes"));
      }
      const payload = (await response.json()) as { data: TraditionalQuote[] };
      const quote = payload.data?.[0];
      if (quote) {
        setTraditionalQuotes((prev) => ({ ...prev, [quote.symbol]: quote }));
        setTraditionalQuotesError(null);
      }
    } catch (err) {
      setTraditionalQuotesError(err instanceof Error ? err.message : t("mc_err_data"));
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
        throw new Error(payload?.error ?? t("mc_err_quotes"));
      }
      const payload = (await response.json()) as { data: TraditionalQuote[] };
      const next: Record<string, TraditionalQuote> = {};
      payload.data.forEach((quote) => {
        next[quote.symbol] = quote;
      });
      setTraditionalQuotes((prev) => ({ ...prev, ...next }));
      setTraditionalQuotesError(null);
    } catch (err) {
      setTraditionalQuotesError(err instanceof Error ? err.message : t("mc_err_data"));
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
    // Auto-select first asset so chart is visible on load
    setSelectedTraditional(traditionalAssets[0] ?? null);
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
      setFearGreedError(false);
      try {
        const response = await fetch("/api/fear-greed", { cache: "no-store" });
        if (!response.ok) throw new Error("fng");
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
        setFearGreedError(true);
      }
    };
    loadFearGreed();
  }, [fearGreedTick]);

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
          <h1 className="text-3xl font-semibold text-white">{t("mc_market")}</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            {marketMode === "crypto"
              ? t("mc_coinex_desc")
              : t("mc_trad_desc")}
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
              {t("mc_crypto_market")}
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
              {t("mc_trad_market")}
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
              {t("mc_news_ai")}
            </button>
          </div>
        </div>

        {marketMode === "crypto" && chartSource === "coinglass" && (
          <div className="mx-auto w-full max-w-6xl">
            {fearGreedError && (
              <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">
                ⚠️ {t("mc_fng_fail")}{" "}
                <button type="button" onClick={() => setFearGreedTick((v) => v + 1)} className="font-semibold underline">{t("wl_retry")}</button>
              </p>
            )}
            <FearGreedWidget
              points={fearGreedPoints}
              timeUntilUpdateSec={fearGreedCountdown}
              selectedSymbol={selected?.symbol ?? null}
              communitySentiment={communitySentiment}
            />
          </div>
        )}

        {marketMode === "crypto" ? (
          <section className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">{t("mc_asset_chart")}</h2>
              <p className="text-sm text-slate-400">
                {selected ? `${selected.name} · ${selected.symbol}` : t("mc_select_asset")}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* timeframe bar removed (use chart internal controls) */}
              <div className="keep-dark flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/80 px-2 py-1 text-xs font-semibold text-slate-200">
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
                  {t("mc_tab_sentiment")}
                </button>
              </div>
              {chartSource === "tradingview" && (
                <button
                  type="button"
                  className="keep-dark rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                  onClick={() => {
                    if (document.fullscreenElement) {
                      document.exitFullscreen();
                      return;
                    }
                    chartRef.current?.requestFullscreen?.();
                  }}
                >
                  {isFullscreen ? t("mc_exit_fs") : t("mc_fullscreen")}
                </button>
              )}
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
                {t("mc_exit_fs")}
              </button>
            )}
            {chartSource === "tradingview" ? (
              <TradingViewWidget
                key={`tv-${tradingViewSymbol}-${tradingViewInterval}`}
                symbol={tradingViewSymbol}
                interval={tradingViewInterval}
              />
            ) : (
              <DerivativesPanel
                data={derivatives}
                loading={derivativesLoading}
                symbol={selected?.symbol ?? "BTC"}
                updatedAt={derivativesAt}
                error={derivativesError}
                onRefresh={() => setDerivativesTick((v) => v + 1)}
              />
            )}
          </div>
        </section>
        ) : null}

        {marketMode === "tradicional" && (
          <section className="mx-auto w-full max-w-6xl rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">{t("mc_trad_market")}</h2>
                <p className="text-sm text-slate-400">
                  {t("mc_trad_hint")}
                </p>
              </div>
              {traditionalQuotesError ? (
                <p className="text-xs text-rose-300">{traditionalQuotesError}</p>
              ) : null}
            </div>

            {/* Gráfico no topo da secção */}
            <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{t("mc_chart")}</p>
                  <p className="text-sm text-slate-400">
                    {selectedTraditional
                      ? selectedTraditional.label
                      : t("mc_select_chart")}
                  </p>
                </div>
              </div>
              <div className="mt-4 h-[460px] rounded-xl border border-slate-800 bg-slate-950/50 p-2">
                {selectedTraditional?.tvSymbol ? (
                  <TradingViewWidget
                    key={`${selectedTraditional.tvSymbol}-${traditionalTradingViewInterval}`}
                    symbol={selectedTraditional.tvSymbol}
                    interval={traditionalTradingViewInterval}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-slate-500">
                    {t("mc_no_symbol")}
                  </div>
                )}
              </div>
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
                        {isInPortfolio ? t("mc_in_wallet") : t("mc_add")}
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
                        {isQuoteLoading ? t("mc_updating") : t("mc_update_price")}
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
                    {t("mc_trad_portfolio")}
                  </p>
                  <p className="text-sm text-slate-400">
                    {selectedTraditionalAssets.length
                      ? t("mc_set_buy")
                      : t("mc_select_trad")}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Total</p>
                  <p className="text-lg font-semibold text-white">
                    {fmtCur(traditionalTotal)}
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
                  <option value="date">{t("mc_buy_date")}</option>
                  <option value="marketCap">{t("mc_mcap")}</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    setTraditionalSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
                  }
                  className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                >
                  {traditionalSortDir === "asc" ? t("mc_asc") : t("mc_desc")}
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {sortedSelectedTraditional.length === 0 ? (
                  <p className="text-sm text-slate-500">{t("mc_no_asset")}</p>
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
                            placeholder={t("mc_buy_value")}
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
                            {t("wl_current_price")}{" "}
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
                              <option value="1d">{t("mc_daily")}</option>
                              <option value="30d">{t("pc_30_days")}</option>
                              <option value="60d">{t("wl_60_days")}</option>
                              <option value="1y">{t("mc_annual")}</option>
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
                            {isQuoteLoading ? t("mc_updating") : t("mc_update_price")}
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleTraditionalHolding(asset.id)}
                            className="rounded-full border border-slate-700 px-3 py-2 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                          >
                            {t("wl_remove")}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

          </section>
        )}

        {marketMode === "crypto" && marketGlobal && (
          <div className="mx-auto mb-6 w-full max-w-6xl">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-3 text-sm">
              {marketGlobal.totalMarketCapUsd != null && (
                <span className="text-slate-300">
                  {t("mc_total_cap")}: <b className="text-white">${(marketGlobal.totalMarketCapUsd / 1e12).toFixed(2)}T</b>
                  {marketGlobal.marketCapChange24h != null && (
                    <span className={marketGlobal.marketCapChange24h >= 0 ? "ml-1 text-emerald-400" : "ml-1 text-rose-400"}>
                      ({marketGlobal.marketCapChange24h >= 0 ? "+" : ""}{marketGlobal.marketCapChange24h.toFixed(2)}%)
                    </span>
                  )}
                </span>
              )}
              {marketGlobal.btcDominance != null && (
                <span className="text-slate-300">{t("mc_btc_dom")}: <b className="text-amber-400">{marketGlobal.btcDominance.toFixed(1)}%</b></span>
              )}
              {marketGlobal.ethDominance != null && (
                <span className="text-slate-300">ETH: <b className="text-indigo-300">{marketGlobal.ethDominance.toFixed(1)}%</b></span>
              )}
            </div>
          </div>
        )}

        {marketMode === "crypto" ? (
        <div className="mx-auto w-full max-w-6xl">
          <div>
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">{t("mc_top200")}</h2>
                <span className="text-xs text-slate-500">
                  {t("mc_source_note")}
                </span>
              </div>

              {isLoading ? (
                <p className="mt-6 text-sm text-slate-400">{t("mc_loading_markets")}</p>
              ) : error ? (
                <p className="mt-6 text-sm text-rose-300">{error}</p>
              ) : (
                <div className="mt-6">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
                    <input
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPage(0);
                      }}
                      placeholder={t("mc_search_ph")}
                      className="w-full rounded-xl border border-slate-800 bg-slate-950/70 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-slate-600"
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
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
                          {showFavorites ? t("mc_show_fav_on") : t("mc_show_fav")}
                        </button>
                        <select
                          value={sortKey}
                          onChange={(e) => setSortKey(e.target.value as SortKey)}
                          className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs font-semibold text-slate-200 outline-none focus:border-slate-600"
                        >
                          <option value="marketCapUsd">{t("mc_mcap")}</option>
                          <option value="volume24hUsd">{t("mc_sort_vol")}</option>
                          <option value="priceUsd">Preço</option>
                          <option value="change24h">{t("mc_sort_change")}</option>
                          <option value="symbol">{t("mc_sort_symbol")}</option>
                        </select>
                        <button
                          type="button"
                          className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
                        >
                          {sortDir === "asc" ? t("mc_asc") : t("mc_desc")}
                        </button>
                      </div>
                      <p className="text-xs text-slate-400">
                        {t("mc_showing")}{" "}
                        <span className="font-semibold text-slate-200">{pageRange.total ? pageRange.start + 1 : 0}</span>
                        {"–"}
                        <span className="font-semibold text-slate-200">{pageRange.end}</span> de{" "}
                        <span className="font-semibold text-slate-200">{pageRange.total}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => setPage(Math.max(0, currentPage - 1))}
                        disabled={currentPage <= 0}
                      >
                        {t("mc_prev")}
                      </button>
                      <div className="text-xs text-slate-400">
                        {t("mc_page")} <span className="font-semibold text-slate-200">{currentPage + 1}</span> /{" "}
                        <span className="font-semibold text-slate-200">{totalPages}</span>
                      </div>
                      <button
                        type="button"
                        className="rounded-full border border-slate-700 bg-slate-950/80 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => setPage(Math.min(totalPages - 1, currentPage + 1))}
                        disabled={currentPage >= totalPages - 1}
                      >
                        {t("mc_next")}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-[0.2em] text-slate-500">
                      <tr className="border-b border-slate-800">
                        <th className="px-4 py-3">#</th>
                        <th className="px-4 py-3">{t("mc_col_crypto")}</th>
                        <th className="px-4 py-3">{t("mc_col_price_usd")}</th>
                        <th className="px-4 py-3">1h</th>
                        <th className="px-4 py-3" title="24h">{t("mc_sort_change")}</th>
                        <th className="px-4 py-3">7d</th>
                        <th className="px-4 py-3">30d</th>
                        <th className="px-4 py-3">{t("mc_col_mcap_usd")}</th>
                        <th className="px-4 py-3">{t("mc_col_vol_usd")}</th>
                        <th className="px-4 py-3" title="Variação de preço nos últimos 7 dias">{t("mc_col_trend")}</th>
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
                                title={favorites.has(row.symbol) ? t("mc_rm_fav") : t("mc_add_fav")}
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
                          <td className={`px-4 py-4 font-semibold ${row.change1h == null ? "text-slate-500" : row.change1h >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {row.change1h == null ? "—" : formatPercent(row.change1h)}
                          </td>
                          <td
                            className={`px-4 py-4 font-semibold ${
                              row.change24h >= 0 ? "text-emerald-300" : "text-rose-300"
                            }`}
                          >
                            {formatPercent(row.change24h)}
                          </td>
                          <td className={`px-4 py-4 font-semibold ${row.change7d == null ? "text-slate-500" : row.change7d >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {row.change7d == null ? "—" : formatPercent(row.change7d)}
                          </td>
                          <td className={`px-4 py-4 font-semibold ${row.change30d == null ? "text-slate-500" : row.change30d >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                            {row.change30d == null ? "—" : formatPercent(row.change30d)}
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
                              prices={row.sparkline}
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
                <p className="text-xs uppercase tracking-[0.2em] text-orange-400">{t("mc_briefing")}</p>
                <h2 className="text-lg font-bold text-white mt-1">{t("mc_ai_market")}</h2>
                <p className="text-sm text-slate-400 mt-0.5">{t("mc_powered")}</p>
              </div>

              {/* Tabs crypto/tradicional/diarias */}
              <div className="flex gap-2">
                {(["crypto", "tradicional", "diarias"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={async () => {
                      setNewsMode(m);
                      // O briefing/chat pertencem ao modo anterior — não mostrar com o rótulo novo
                      setNewsContent(null); setNewsError(null); setNewsDate(null);
                      setChatMessages([]);
                      if (m === "diarias" && newsItems.length === 0) {
                        setNewsItemsLoading(true);
                        setNewsItemsError(false);
                        try {
                          const r = await fetch(`/api/news?lang=${lang}`);
                          if (!r.ok) throw new Error("news");
                          const d = await r.json() as { items?: NewsItem[] };
                          setNewsItems(d.items ?? []);
                        } catch { setNewsItemsError(true); } finally {
                          setNewsItemsLoading(false);
                        }
                      }
                    }}
                    className={`rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                      newsMode === m
                        ? "border-orange-400 bg-orange-500/20 text-orange-200"
                        : "border-slate-700 text-slate-400 hover:border-slate-500"
                    }`}
                  >
                    {m === "crypto" ? t("mc_crypto") : m === "tradicional" ? t("mc_traditional") : `📰 ${t("mc_news")}`}
                  </button>
                ))}
              </div>

              {/* News feed */}
              {newsMode === "diarias" && (
                <div className="space-y-3">
                  {newsItemsLoading && (
                    <p className="animate-pulse text-sm text-slate-400">{t("mc_loading_news")}</p>
                  )}
                  {!newsItemsLoading && newsItems.length === 0 && (
                    <p className="text-sm text-slate-500">{t("mc_no_news")}</p>
                  )}
                  {newsItems.map((item, i) => (
                    <a
                      key={i}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex gap-3 rounded-xl border border-slate-700 bg-slate-800/40 p-4 transition hover:border-orange-500/40 hover:bg-slate-800"
                    >
                      {item.image && (
                        <img
                          src={item.image}
                          alt=""
                          className="h-16 w-24 shrink-0 rounded-lg object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-400">{item.source}</span>
                          {item.pubDate && (
                            <span className="text-[10px] text-slate-500">
                              {new Date(item.pubDate).toLocaleString(uiLocale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-semibold text-slate-200 group-hover:text-orange-300 leading-snug">{item.title}</p>
                        {item.description && (
                          <p className="mt-1 text-[11px] text-slate-500 leading-relaxed line-clamp-2">{item.description}</p>
                        )}
                      </div>
                    </a>
                  ))}
                  {newsItemsError && !newsItemsLoading && (
                    <p className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-200">⚠️ {t("mc_news_fail")}</p>
                  )}
                  {!newsItemsLoading && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="flex-1 rounded-xl border border-slate-700 py-2 text-xs text-slate-400 hover:border-slate-500 hover:text-slate-200 transition"
                        onClick={async () => {
                          setNewsItemsLoading(true);
                          setNewsItemsError(false);
                          try {
                            const r = await fetch(`/api/news?lang=${lang}`);
                            if (!r.ok) throw new Error("news");
                            const d = await r.json() as { items?: NewsItem[] };
                            setNewsItems(d.items ?? []);
                            setNewsBriefing(null); setNewsBriefingError(null); setNewsBriefingDate(null);
                          } catch { setNewsItemsError(true); } finally {
                            setNewsItemsLoading(false);
                          }
                        }}
                      >
                        ↻ {t("mc_refresh_news")}
                      </button>
                      {userPlan === "free" ? (
                        <a href={paymentsFrozen ? "/beta" : "/pricing"} className="flex-1 rounded-xl border border-orange-500/30 py-2 text-xs font-bold text-orange-400/70 text-center hover:bg-orange-500/10 transition">
                          {paymentsFrozen ? `🧪 ${t("dash_beta_cta_short")} →` : `🔒 ${t("mc_ai_analysis")} — Pro`}
                        </a>
                      ) : userPlan === "unknown" ? null : (
                      <button
                        type="button"
                        disabled={newsBriefingLoading}
                        className="flex-1 rounded-xl bg-orange-500 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400 disabled:opacity-50 transition"
                        onClick={async () => {
                          setNewsBriefingLoading(true);
                          setNewsBriefingError(null);
                          setNewsBriefing(null);
                          try {
                            const r = await fetch("/api/news-briefing", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ items: newsItems, lang }),
                            });
                            const d = await r.json() as { content?: string; error?: string; date?: string };
                            if (!r.ok || d.error) { setNewsBriefingError(d.error ?? t("mc_err_data")); return; }
                            setNewsBriefing(d.content ?? "");
                            setNewsBriefingDate(d.date ?? null);
                          } catch (e) {
                            setNewsBriefingError(e instanceof Error ? e.message : t("mc_err_data"));
                          } finally {
                            setNewsBriefingLoading(false);
                          }
                        }}
                      >
                        {newsBriefingLoading ? "A analisar…" : "🤖 Análise IA"}
                      </button>
                      )}
                    </div>
                  )}

                  {newsBriefingError && <p className="text-sm text-rose-400">{newsBriefingError}</p>}

                  {newsBriefingLoading && (
                    <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/40 px-5 py-4">
                      <div className="flex gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:0ms]"/>
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:150ms]"/>
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:300ms]"/>
                      </div>
                      <p className="text-sm text-slate-400">{t("mc_analyzing_news")}</p>
                    </div>
                  )}

                  {newsBriefing && (
                    <div className="rounded-xl border border-orange-500/20 bg-slate-950/60 p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.2em] text-orange-400">{t("mc_ai_news")}</p>
                        <span className="text-[10px] text-slate-500">{newsBriefingDate}</span>
                      </div>
                      <div className="space-y-1">
                        {newsBriefing.split("\n").map((line, i) => {
                          if (line.startsWith("## ")) return <h3 key={i} className="text-base font-bold text-white mt-5 mb-1">{line.replace(/^## /, "")}</h3>;
                          if (line.startsWith("### ")) return <h4 key={i} className="text-sm font-semibold text-orange-300 mt-3 mb-0.5">{line.replace(/^### /, "")}</h4>;
                          if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="text-sm font-semibold text-slate-200">{line.replace(/\*\*/g, "")}</p>;
                          if (/^\*\*[^*]+\*\*:/.test(line)) {
                            const [bold, ...rest] = line.split(":**");
                            return <p key={i} className="text-sm text-slate-300"><span className="font-semibold text-slate-100">{bold.replace(/\*\*/g, "")}:</span>{rest.join(":**")}</p>;
                          }
                          if (line.startsWith("- ")) return <p key={i} className="text-sm text-slate-300 pl-3 border-l border-orange-500/30 my-1">{line.replace(/^- /, "")}</p>;
                          if (line.startsWith("---")) return <hr key={i} className="border-slate-700 my-3" />;
                          if (line.startsWith("*") && line.endsWith("*")) return <p key={i} className="text-[11px] text-slate-500 italic">{line.replace(/^\*|\*$/g, "")}</p>;
                          if (line.trim() === "") return <div key={i} className="h-1" />;
                          return <p key={i} className="text-sm text-slate-300 leading-relaxed">{line}</p>;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {newsMode !== "diarias" && (<>
              {userPlan === "free" ? (
                <a href={paymentsFrozen ? "/beta" : "/pricing"} className="inline-block rounded-xl border border-orange-500/30 px-6 py-2.5 text-sm font-bold text-orange-400/70 hover:bg-orange-500/10 transition">
                  {paymentsFrozen ? `🧪 ${t("dash_beta_cta_short")} →` : `🔒 ${t("mc_gen_briefing")} — Pro`}
                </a>
              ) : userPlan === "unknown" ? null : (
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
                      body: JSON.stringify({ mode: newsMode, lang }),
                    });
                    const data = await res.json() as { content?: string; error?: string; date?: string };
                    if (!res.ok || data.error) { setNewsError(data.error ?? t("mc_err_data")); return; }
                    setNewsContent(data.content ?? "");
                    setNewsDate(data.date ?? null);
                  } catch (err) {
                    setNewsError(err instanceof Error ? err.message : t("mc_err_data"));
                  } finally {
                    setNewsLoading(false);
                  }
                }}
                className={`${btnPrimary} px-6 py-2.5 text-sm`}
              >
                {newsLoading ? t("mc_generating") : t("mc_gen_briefing")}
              </button>
              )}

              {newsError && <p className="text-sm text-rose-400">{newsError}</p>}

              {newsContent && (
                <>
                  <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500">{newsMode === "crypto" ? t("mc_crypto") : t("mc_mtrad")} · {newsDate}</p>
                      <span className="text-xs text-orange-400 font-semibold">🤖 ChainFolioAI</span>
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
                        <p className="text-sm font-semibold text-white">{t("mc_questions")}</p>
                        <p className="text-xs text-slate-400">{t("mc_questions_desc")}</p>
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
                                <p className="text-[10px] text-orange-400 font-semibold mb-1">🤖 ChainFolioAI</p>
                              )}
                              <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            </div>
                          </div>
                        ))}
                        {chatLoading && (
                          <div className="flex justify-start">
                            <div className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5">
                              <p className="text-[10px] text-orange-400 font-semibold mb-1">🤖 ChainFolioAI</p>
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
                              nickname: loadNickname() || undefined,
                              lang,
                            }),
                          });
                          const data = await res.json() as { reply?: string; error?: string };
                          const reply = data.reply ?? data.error ?? t("mc_err_response");
                          setChatMessages(prev => [...prev, { role: "assistant", content: reply }]);
                        } catch {
                          setChatMessages(prev => [...prev, { role: "assistant", content: t("mc_err_conn") }]);
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
                        placeholder={t("mc_chat_ph")}
                        disabled={chatLoading}
                        className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={chatLoading || !chatInput.trim()}
                        className={`${btnPrimary} px-4 py-2.5 text-sm`}
                      >
                        {t("mc_send")}
                      </button>
                    </form>
                  </div>
                </>
              )}
              </>)}
            </div>
          </div>
        )}
      </main>
    </div>
    </AppShell>
  );
}
