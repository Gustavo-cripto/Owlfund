"use client";

import { useEffect, useRef, useState } from "react";
import type { Bar } from "@/lib/portfolio/history";
import { sma } from "@/lib/portfolio/history";

// Grafico do portefolio com a lightweight-charts (a biblioteca open-source da
// TradingView): area OU velas, cruz de referencia com data e valor, eixo
// ajustado ao intervalo, arrasto e zoom. Carregada so aqui, por import(),
// para nao pesar nas outras paginas. Recebe barras ja em euros.
export type ChartMode = "area" | "candles";

type Props = {
  bars: Bar[];
  mode: ChartMode;
  /** Medias moveis a desenhar (periodos), ex. [20, 50]. */
  averages: number[];
  /** Intervalo curto: eixo com horas; longo: com datas. */
  intraday: boolean;
  up: boolean;
  format: (v: number) => string;
  locale: string;
  /** Valor e instante sob a cruz (null = fora do grafico). */
  onHover?: (p: { t: number; value: number } | null) => void;
};

type LC = typeof import("lightweight-charts");

export default function PortfolioHistoryChart({ bars, mode, averages, intraday, up, format, locale, onHover }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [lc, setLc] = useState<LC | null>(null);
  const hoverRef = useRef(onHover);
  hoverRef.current = onHover;

  useEffect(() => { let alive = true; import("lightweight-charts").then((m) => { if (alive) setLc(m); }); return () => { alive = false; }; }, []);

  useEffect(() => {
    const el = ref.current;
    if (!lc || !el || bars.length === 0) return;
    const upColor = "#10b981", downColor = "#f43f5e";
    const color = up ? upColor : downColor;
    const chart = lc.createChart(el, {
      autoSize: true,
      layout: { background: { type: lc.ColorType.Solid, color: "transparent" }, textColor: "#64748b", fontSize: 10, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: "#1e293b", style: lc.LineStyle.Dashed } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderVisible: false, timeVisible: intraday, secondsVisible: false, fixLeftEdge: true, fixRightEdge: true },
      crosshair: { mode: lc.CrosshairMode.Magnet, vertLine: { color: "#475569", labelBackgroundColor: "#1e293b" }, horzLine: { color: "#475569", labelBackgroundColor: "#1e293b" } },
      localization: { priceFormatter: (v: number) => format(v), locale },
      handleScroll: { vertTouchDrag: false },
    });
    const toTime = (t: number) => Math.floor(t / 1000) as import("lightweight-charts").UTCTimestamp;

    let main: import("lightweight-charts").ISeriesApi<"Area"> | import("lightweight-charts").ISeriesApi<"Candlestick">;
    if (mode === "candles") {
      main = chart.addSeries(lc.CandlestickSeries, { upColor, downColor, borderVisible: false, wickUpColor: upColor, wickDownColor: downColor, priceLineVisible: false, lastValueVisible: true });
      main.setData(bars.map((b) => ({ time: toTime(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
    } else {
      main = chart.addSeries(lc.AreaSeries, { lineColor: color, topColor: `${color}40`, bottomColor: `${color}00`, lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 4 });
      main.setData(bars.map((b) => ({ time: toTime(b.t), value: b.c })));
    }
    const maColors = ["#f59e0b", "#8b5cf6", "#38bdf8"];
    averages.forEach((n, i) => {
      if (bars.length < n + 1) return;
      const s = chart.addSeries(lc.LineSeries, { color: maColors[i % maColors.length], lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(sma(bars, n).filter((p) => p.v != null).map((p) => ({ time: toTime(p.t), value: p.v as number })));
    });
    chart.timeScale().fitContent();

    chart.subscribeCrosshairMove((p) => {
      if (!p.time || !p.point) { hoverRef.current?.(null); return; }
      const d = p.seriesData.get(main) as { value?: number; close?: number } | undefined;
      const value = d?.value ?? d?.close;
      if (typeof value === "number") hoverRef.current?.({ t: Number(p.time) * 1000, value });
    });

    return () => { chart.remove(); };
  }, [lc, bars, mode, averages, intraday, up, format, locale]);

  return <div ref={ref} className="h-full w-full" aria-hidden />;
}
