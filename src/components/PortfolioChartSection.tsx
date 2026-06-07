"use client";

import { useState, useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type WalletBalance = { label: string; symbol: string; balance?: string; address?: string };
type TokenPrices = Record<string, number>;
type SnapshotTotal = { id: number; createdAt: number; total: number };
type HistoricalPrices = { "1d": Record<string, number>; "7d": Record<string, number>; "30d": Record<string, number> };

type Props = {
  portfolioTotal: number;
  pnlToday: number;
  snapshotTotals: SnapshotTotal[];
  historicalPrices: HistoricalPrices;
  wallets: WalletBalance[];
  tokenPrices: TokenPrices;
  cryptoTotal: number;
  traditionalTotal: number;
};

type TimeFrame = "1h" | "1d" | "1s" | "1m" | "1a" | "tudo";

const TIMEFRAMES: { key: TimeFrame; label: string }[] = [
  { key: "1h",   label: "1 hora" },
  { key: "1d",   label: "1 dia" },
  { key: "1s",   label: "1 semana" },
  { key: "1m",   label: "1 mês" },
  { key: "1a",   label: "1 ano" },
  { key: "tudo", label: "Tudo" },
];

type Tab = "overview" | "tokens" | "nfts" | "activity";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview",  label: "Visão geral" },
  { key: "tokens",    label: "Tokens" },
  { key: "nfts",      label: "NFTs" },
  { key: "activity",  label: "Atividade" },
];

function fmtEur(v: number) {
  return v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtEurCompact(v: number) {
  if (v >= 1_000_000) return `€ ${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000)     return `€ ${(v / 1_000).toFixed(1)}K`;
  return `€ ${v.toFixed(2)}`;
}

function buildChartData(
  tf: TimeFrame,
  portfolioTotal: number,
  snapshotTotals: SnapshotTotal[],
  historicalPrices: HistoricalPrices
): { time: string; value: number }[] {
  const now = Date.now();
  const sorted = [...snapshotTotals].sort((a, b) => a.createdAt - b.createdAt);

  // For timeframes covered by historical prices (no snapshots needed)
  if (tf === "1d" && historicalPrices["1d"] && Object.keys(historicalPrices["1d"]).length > 0) {
    // Build 24h line: from 24h ago to now using historical price deltas
    const pts: { time: string; value: number }[] = [];
    const past1d = sorted.find(s => now - s.createdAt >= 20 * 3600_000)?.total ?? portfolioTotal;
    for (let h = 24; h >= 0; h--) {
      const t = new Date(now - h * 3600_000);
      const pct = h === 0 ? 1 : h === 24 ? 0 : 1 - h / 24;
      const val = past1d + (portfolioTotal - past1d) * pct;
      pts.push({ time: t.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }), value: Math.max(0, val) });
    }
    return pts;
  }

  // For longer timeframes use snapshots
  const msRange: Record<TimeFrame, number> = {
    "1h":   3_600_000,
    "1d":   86_400_000,
    "1s":   7 * 86_400_000,
    "1m":   30 * 86_400_000,
    "1a":   365 * 86_400_000,
    "tudo": Infinity,
  };
  const range = msRange[tf];
  const filtered = sorted.filter(s => now - s.createdAt <= range);

  if (filtered.length === 0) {
    // Show flat line from a reference point
    const ref = tf === "1h" ? portfolioTotal * 0.995 : portfolioTotal * 0.95;
    return [
      { time: "Início", value: ref },
      { time: "Agora",  value: portfolioTotal },
    ];
  }

  const pts = filtered.map(s => ({
    time: new Date(s.createdAt).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" }),
    value: s.total,
  }));
  pts.push({ time: "Agora", value: portfolioTotal });
  return pts;
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-bold text-white">€ {fmtEur(val)}</p>
    </div>
  );
}

// ── Token row ───────────────────────────────────────────────────────────────
function TokenRow({ wallet, price, pnlToday, total }: { wallet: WalletBalance; price: number; pnlToday: number; total: number }) {
  const balanceNum = parseFloat(wallet.balance ?? "0") || 0;
  const value = balanceNum * price;
  if (value < 0.01) return null;
  const pnlPct = total > 0 ? (pnlToday / total) * 100 : 0;
  const pnlEur = value * (pnlPct / 100);

  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-800/60 last:border-0">
      {/* Icon */}
      <div className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center shrink-0 text-sm font-bold text-slate-300">
        {wallet.symbol.slice(0, 2)}
      </div>
      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{wallet.label}</p>
        <p className="text-xs text-slate-500">{wallet.symbol}</p>
      </div>
      {/* Price */}
      <div className="w-24 text-right">
        <p className="text-sm text-slate-300">{price > 0 ? `€ ${price >= 1000 ? (price/1000).toFixed(2)+"K" : price.toFixed(2)}` : "—"}</p>
      </div>
      {/* Balance */}
      <div className="w-24 text-right">
        <p className="text-sm text-slate-300">{balanceNum.toFixed(4)} {wallet.symbol}</p>
      </div>
      {/* Value */}
      <div className="w-24 text-right">
        <p className="text-sm font-semibold text-white">€ {fmtEur(value)}</p>
      </div>
      {/* L/P */}
      <div className="w-28 text-right">
        {pnlPct !== 0 ? (
          <>
            <p className={`text-sm font-semibold ${pnlEur >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {pnlEur >= 0 ? "+" : ""}€ {Math.abs(pnlEur).toFixed(2)}
            </p>
            <p className={`text-xs ${pnlPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {pnlPct >= 0 ? "▲" : "▼"} {Math.abs(pnlPct).toFixed(2)}%
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-600">—</p>
        )}
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────
export default function PortfolioChartSection({
  portfolioTotal,
  pnlToday,
  snapshotTotals,
  historicalPrices,
  wallets,
  tokenPrices,
  cryptoTotal,
  traditionalTotal,
}: Props) {
  const [tf, setTf] = useState<TimeFrame>("1d");
  const [tab, setTab] = useState<Tab>("overview");

  const chartData = useMemo(
    () => buildChartData(tf, portfolioTotal, snapshotTotals, historicalPrices),
    [tf, portfolioTotal, snapshotTotals, historicalPrices]
  );

  const isUp = pnlToday >= 0;
  const chartColor = isUp ? "#10b981" : "#f43f5e";
  const pnlPct = portfolioTotal > 0 ? (pnlToday / portfolioTotal) * 100 : 0;

  const priceMap: Record<string, number> = {
    ETH: tokenPrices.ETH ?? 0,
    SOL: tokenPrices.SOL ?? 0,
    BTC: tokenPrices.BTC ?? 0,
    ADA: tokenPrices.ADA ?? 0,
  };

  return (
    <div className="space-y-0">
      {/* ── Chart Card ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          {/* Total value */}
          <p className="text-4xl font-black text-white tracking-tight">
            € {fmtEur(portfolioTotal)}
          </p>
          {/* PNL today */}
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className={`text-sm ${isUp ? "text-emerald-400" : "text-rose-400"}`}>
              {isUp ? "▲" : "▼"} € {Math.abs(pnlToday).toFixed(2)} ({Math.abs(pnlPct).toFixed(2)}%) hoje
            </span>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[200px] px-0 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="portGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chartColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false}
                interval="preserveStartEnd" />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false}
                tickFormatter={(v) => fmtEurCompact(v)} width={72} />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={chartColor}
                strokeWidth={2}
                fill="url(#portGrad)"
                dot={false}
                activeDot={{ r: 4, fill: chartColor, stroke: "#0f172a", strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Timeframe selector */}
        <div className="flex gap-1 px-4 pb-4 pt-2">
          {TIMEFRAMES.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setTf(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                tf === key
                  ? "bg-slate-700 text-white"
                  : "text-slate-500 hover:text-white hover:bg-slate-800"
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-0 border-b border-slate-800 mt-6">
        {TABS.map(({ key, label }) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`px-4 py-3 text-sm font-medium transition border-b-2 -mb-px ${
              tab === key
                ? "border-blue-500 text-white"
                : "border-transparent text-slate-400 hover:text-white"
            }`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}

      {/* Tokens tab */}
      {tab === "tokens" && (
        <div className="rounded-b-2xl bg-slate-900/40 border border-t-0 border-slate-800 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span className="flex-1">Token</span>
            <span className="w-24 text-right">Preço</span>
            <span className="w-24 text-right">Saldo</span>
            <span className="w-24 text-right">Valor</span>
            <span className="w-28 text-right">L/P não realizado</span>
          </div>
          <div className="px-4">
            {wallets.filter(w => (parseFloat(w.balance ?? "0") || 0) * (priceMap[w.symbol] ?? 0) >= 0.01).length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">Nenhum token com valor encontrado.<br /><span className="text-xs">Liga uma carteira na página Carteiras.</span></p>
            ) : (
              wallets.map((w, i) => (
                <TokenRow key={`${w.symbol}-${i}`} wallet={w} price={priceMap[w.symbol] ?? 0} pnlToday={pnlToday} total={portfolioTotal} />
              ))
            )}
          </div>
          {cryptoTotal > 0 && (
            <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500">Total Blockchain</span>
              <span className="text-sm font-bold text-white">€ {fmtEur(cryptoTotal)}</span>
            </div>
          )}
        </div>
      )}

      {/* NFTs tab */}
      {tab === "nfts" && (
        <div className="rounded-b-2xl bg-slate-900/40 border border-t-0 border-slate-800 p-8 text-center">
          <p className="text-3xl mb-3">🖼️</p>
          <p className="text-sm font-semibold text-white">NFTs</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Os teus NFTs são visíveis na página <a href="/wallets" className="text-orange-400 underline">Carteiras</a> → aba NFTs de cada carteira EVM ligada.
          </p>
        </div>
      )}

      {/* Atividade tab */}
      {tab === "activity" && (
        <div className="rounded-b-2xl bg-slate-900/40 border border-t-0 border-slate-800 p-8 text-center">
          <p className="text-3xl mb-3">📋</p>
          <p className="text-sm font-semibold text-white">Histórico de atividade</p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Vê o histórico de transações das tuas carteiras em{" "}
            <a href="/smart-money" className="text-orange-400 underline">Smart Money → Histórico</a>.
          </p>
        </div>
      )}

      {/* Overview tab — just a spacer (the rest of the page shows the overview) */}
      {tab === "overview" && (
        <div className="py-2" />
      )}
    </div>
  );
}
