"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type CandlePoint = {
  x: number;
  open: number;
  close: number;
  high: number;
  low: number;
  isUp: boolean;
};

const buildCandles = (change: number, seed: number): CandlePoint[] => {
  const candles: CandlePoint[] = [];
  const base = change >= 0 ? 9 : 12;
  let last = base + (seed % 5) * 0.3;
  for (let i = 0; i < 10; i += 1) {
    const drift = (change >= 0 ? -1 : 1) * (i / 9) * 2.2;
    const noise = Math.sin((i + seed) * 0.9) * 1.4;
    const open = Math.max(2.2, Math.min(17.5, last));
    const close = Math.max(2.2, Math.min(17.5, open + noise + drift));
    const high = Math.max(open, close) + 1.1 + Math.abs(Math.cos((i + seed) * 0.6));
    const low = Math.min(open, close) - 1.1 - Math.abs(Math.sin((i + seed) * 0.5));
    const clampedHigh = Math.min(19, high);
    const clampedLow = Math.max(1, low);
    candles.push({
      x: i * 10 + 5,
      open,
      close,
      high: clampedHigh,
      low: clampedLow,
      isUp: close >= open,
    });
    last = close;
  }
  return candles;
};

function TrendSparkline({ change, seed }: { change: number; seed: number }) {
  const upColor = "#34d399";
  const downColor = "#fb7185";
  const candles = buildCandles(change, seed);
  return (
    <svg width="90" height="24" viewBox="0 0 100 20" aria-hidden>
      {candles.map((candle, index) => {
        const color = candle.isUp ? upColor : downColor;
        const bodyTop = candle.isUp ? candle.close : candle.open;
        const bodyBottom = candle.isUp ? candle.open : candle.close;
        const bodyHeight = Math.max(0.8, bodyBottom - bodyTop);
        return (
          <g key={`${candle.x}-${index}`}>
            <line
              x1={candle.x}
              y1={candle.high}
              x2={candle.x}
              y2={candle.low}
              stroke={color}
              strokeWidth="1"
            />
            <rect
              x={candle.x - 1.8}
              y={bodyTop}
              width="3.6"
              height={bodyHeight}
              fill={color}
              rx="0.6"
            />
          </g>
        );
      })}
    </svg>
  );
}

function TradingViewWidget({
  symbol,
  height,
  interval,
}: {
  symbol: string;
  height?: number | string;
  interval: string;
}) {
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
      const container = document.getElementById("tradingview-widget");
      if (!container || !("TradingView" in window)) return;
      container.innerHTML = "";
      // @ts-expect-error TradingView is injected by script
      new window.TradingView.widget({
        container_id: "tradingview-widget",
        symbol,
        interval,
        timezone: "Etc/UTC",
        theme: "dark",
        style: 1,
        locale: "pt",
        enable_publishing: false,
        hide_top_toolbar: true,
        withdateranges: true,
        hide_side_toolbar: false,
        save_image: false,
        height: height ?? 480,
      });
    });
  }, [symbol, height, interval]);

  const resolvedHeight = height ?? 480;
  const heightClass =
    typeof resolvedHeight === "number" ? `h-[${resolvedHeight}px]` : "h-full";
  return <div id="tradingview-widget" className={`w-full ${heightClass}`} />;
}

export default function MercadoPage() {
  useRequireAuth("/login");
  const [rows, setRows] = useState<MarketRow[]>([]);
  const [selected, setSelected] = useState<MarketRow | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [timeframe, setTimeframe] = useState<
    "1h" | "4h" | "7d" | "Diária" | "Semanal" | "1M" | "3M" | "1A" | "Máx"
  >("Diária");

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/markets");
        const data = (await response.json()) as { data?: MarketRow[]; error?: string };
        if (!response.ok || !data.data) {
          throw new Error(data.error ?? "Não foi possível carregar mercados.");
        }
        setRows(data.data);
        setSelected(data.data[0] ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar mercados.");
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const handleChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleChange);
    return () => document.removeEventListener("fullscreenchange", handleChange);
  }, []);

  const tradingViewSymbol = useMemo(() => {
    if (!selected) return "COINEX:BTCUSDT";
    return `COINEX:${selected.market}`;
  }, [selected]);

  const tradingViewInterval = useMemo(() => {
    switch (timeframe) {
      case "1h":
        return "60";
      case "4h":
        return "240";
      case "7d":
        return "240";
      case "Diária":
        return "D";
      case "Semanal":
        return "W";
      case "1M":
        return "D";
      case "3M":
        return "W";
      case "1A":
        return "W";
      case "Máx":
        return "W";
      default:
        return "60";
    }
  }, [timeframe]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <AppHeader variant="app" subtitle="Panorama do mercado" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-2">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold text-white">Mercado</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Dados em tempo real da CoinEx com comparação entre ativos. Clique em um
            ativo para abrir o gráfico do TradingView.
          </p>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-white">Gráfico do ativo</h2>
              <p className="text-sm text-slate-400">
                {selected ? `${selected.name} · ${selected.symbol}` : "Selecione um ativo"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs font-semibold text-slate-300">
                {(
                  ["1h", "4h", "7d", "Diária", "Semanal", "1M", "3M", "1A", "Máx"] as const
                ).map((label) => {
                  const isActive = timeframe === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      className={`rounded-full px-3 py-1 transition ${
                        isActive
                          ? "bg-slate-800 text-white"
                          : "text-slate-500 hover:text-slate-200"
                      }`}
                      onClick={() => setTimeframe(label)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
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
            className={`mt-6 ${isFullscreen ? "h-screen" : "h-[480px]"} relative`}
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
            <TradingViewWidget
              symbol={tradingViewSymbol}
              height={isFullscreen ? "100%" : 480}
              interval={tradingViewInterval}
            />
          </div>
        </section>

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
            <div className="mt-6 overflow-x-auto">
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
                  {rows.map((row, index) => (
                    <tr
                      key={row.market}
                      className="border-b border-slate-800/60 transition hover:bg-slate-950/60"
                    >
                      <td className="px-4 py-4 text-slate-500">{index + 1}</td>
                      <td className="px-4 py-4">
                        <button
                          type="button"
                          className="flex items-center gap-3 text-left transition hover:text-white"
                          onClick={() => {
                            setSelected(row);
                            chartRef.current?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          <div>
                            <p className="font-semibold text-white">
                              {row.symbol}
                            </p>
                            <p className="text-xs text-slate-500">{row.name}</p>
                          </div>
                        </button>
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
                      <td className="px-4 py-4">
                        <TrendSparkline
                          change={row.change24h}
                          seed={hashSeed(row.market)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
