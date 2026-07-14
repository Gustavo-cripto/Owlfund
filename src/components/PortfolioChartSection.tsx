"use client";

import { useState, useMemo, useEffect } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type WalletBalance = { label: string; symbol: string; balance?: string; address?: string; network?: string };
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
type Tab = "overview" | "tokens" | "nfts" | "defi";

const TIMEFRAMES: { key: TimeFrame; label: string }[] = [
  { key: "1h",   label: "1 hora" },
  { key: "1d",   label: "1 dia" },
  { key: "1s",   label: "1 semana" },
  { key: "1m",   label: "1 mês" },
  { key: "1a",   label: "1 ano" },
  { key: "tudo", label: "Tudo" },
];

const TABS: { key: Tab; labelKey: string }[] = [
  { key: "overview", labelKey: "pcs_overview" },
  { key: "tokens",   labelKey: "pcs_tokens" },
  { key: "nfts",     labelKey: "pcs_nfts" },
  { key: "defi",     labelKey: "pcs_defi" },
];

// ── Symbol → chain map ──────────────────────────────────────────────────────
const SYMBOL_CHAIN: Record<string, string> = {
  ETH: "eth", SOL: "sol", BTC: "btc", ADA: "ada",
};

// ── Network name → Moralis/API chain param ────────────────────────────────
const NETWORK_TO_CHAIN: Record<string, { chain: string; evmChain?: string }> = {
  Ethereum:  { chain: "eth" },
  Arbitrum:  { chain: "eth", evmChain: "arbitrum" },
  Base:      { chain: "eth", evmChain: "base" },
  Optimism:  { chain: "eth", evmChain: "optimism" },
  Polygon:   { chain: "eth", evmChain: "polygon" },
  BSC:       { chain: "eth", evmChain: "bsc" },
  zkSync:    { chain: "eth", evmChain: "zksync" },
  Linea:     { chain: "eth", evmChain: "linea" },
  Solana:    { chain: "sol" },
  Bitcoin:   { chain: "btc" },
  Cardano:   { chain: "ada" },
};

function nftUrl(address: string, network?: string, symbol?: string): string {
  const net = network ?? (symbol ? { ETH: "Ethereum", SOL: "Solana", BTC: "Bitcoin", ADA: "Cardano" }[symbol] : undefined);
  const cfg = NETWORK_TO_CHAIN[net ?? "Ethereum"] ?? { chain: "eth" };
  const base = `/api/nft-balance?address=${encodeURIComponent(address)}&chain=${cfg.chain}`;
  return cfg.evmChain ? `${base}&evmChain=${cfg.evmChain}` : base;
}

function defiUrl(address: string, network?: string, symbol?: string): string {
  const net = network ?? (symbol ? { ETH: "Ethereum", SOL: "Solana" }[symbol] : undefined);
  const cfg = NETWORK_TO_CHAIN[net ?? "Ethereum"] ?? { chain: "eth" };
  const base = `/api/defi-balance?address=${encodeURIComponent(address)}&chain=${cfg.chain}`;
  return cfg.evmChain ? `${base}&evmChain=${cfg.evmChain}` : base;
}

// ── Types for API responses ──────────────────────────────────────────────────
type NftItem = { id: string; name: string; image?: string; tokenAddress?: string; tokenId?: string };
type DefiPosition = { name: string; usd: number };

type WalletNfts = { address: string; chain: string; label: string; nfts: NftItem[]; loading: boolean; error?: string };
type WalletDefi = { address: string; chain: string; label: string; total: number; positions: DefiPosition[]; loading: boolean; error?: string };


function buildChartData(
  tf: TimeFrame,
  portfolioTotal: number,
  snapshotTotals: SnapshotTotal[],
  historicalPrices: HistoricalPrices
): { time: string; value: number }[] {
  const now = Date.now();
  const sorted = [...snapshotTotals].sort((a, b) => a.createdAt - b.createdAt);

  if (tf === "1d" && historicalPrices["1d"] && Object.keys(historicalPrices["1d"]).length > 0) {
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
    const ref = portfolioTotal * 0.97;
    return [{ time: "Início", value: ref }, { time: "Agora", value: portfolioTotal }];
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
  const { format: fmt } = useCurrencyFormat();
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 shadow-xl">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-bold text-white">{fmt(payload[0].value)}</p>
    </div>
  );
}

// ── Token row ───────────────────────────────────────────────────────────────
function TokenRow({ wallet, price, pnlToday, total }: { wallet: WalletBalance; price: number; pnlToday: number; total: number }) {
  const { format: fmt, formatSigned: fmtSigned, hideBalances } = useCurrencyFormat();
  const balanceNum = parseFloat(wallet.balance ?? "0") || 0;
  const value = balanceNum * price;
  if (value < 0.01) return null;
  const pnlPct = total > 0 ? (pnlToday / total) * 100 : 0;
  const pnlEur = value * (pnlPct / 100);
  return (
    <div className="flex items-center gap-3 py-3 border-b border-slate-800/60 last:border-0">
      <div className="h-9 w-9 rounded-full bg-slate-800 flex items-center justify-center shrink-0 text-sm font-bold text-slate-300">{wallet.symbol.slice(0, 2)}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{wallet.label}</p>
        <p className="text-xs text-slate-500">
          {wallet.symbol}
          {wallet.network && wallet.network !== wallet.symbol && (
            <span className="ml-1.5 rounded px-1 py-0.5 text-[10px] border border-slate-700 text-slate-500">{wallet.network}</span>
          )}
        </p>
      </div>
      <div className="w-24 text-right">
        <p className="text-sm text-slate-300">{price > 0 ? fmt(price, { compact: price >= 1000 }) : "—"}</p>
      </div>
      <div className="w-24 text-right">
        <p className="text-sm text-slate-300">{hideBalances ? "••••" : <>{balanceNum.toFixed(4)} {wallet.symbol}</>}</p>
      </div>
      <div className="w-24 text-right">
        <p className="text-sm font-semibold text-white">{fmt(value)}</p>
      </div>
      <div className="w-28 text-right">
        {pnlPct !== 0 ? (
          <>
            <p className={`text-sm font-semibold ${pnlEur >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {fmtSigned(pnlEur)}
            </p>
            <p className={`text-xs ${pnlPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
              {pnlPct >= 0 ? "▲" : "▼"} {Math.abs(pnlPct).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
            </p>
          </>
        ) : <p className="text-sm text-slate-600">—</p>}
      </div>
    </div>
  );
}

// ── NFT card ─────────────────────────────────────────────────────────────────
function NftCard({ nft }: { nft: NftItem }) {
  const [imgErr, setImgErr] = useState(false);
  const img = nft.image;
  const isIpfs = img?.startsWith("ipfs://") ?? false;
  const src = isIpfs && img ? `https://ipfs.io/ipfs/${img.slice(7)}` : img;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden hover:border-slate-600 transition group">
      <div className="aspect-square bg-slate-800 relative overflow-hidden">
        {src && !imgErr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={nft.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={() => setImgErr(true)} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl text-slate-600">🖼️</div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold text-white truncate">{nft.name || "NFT"}</p>
        {nft.tokenId && <p className="text-[10px] text-slate-500">#{String(nft.tokenId).slice(0, 8)}</p>}
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────
export default function PortfolioChartSection({
  portfolioTotal, pnlToday, snapshotTotals, historicalPrices,
  wallets, tokenPrices, cryptoTotal,
}: Props) {
  const { t } = useLanguage();
  const { format: fmt, formatUsd: fmtUsd, hideBalances } = useCurrencyFormat();
  const fmtCompact = (v: number) => fmt(v, { compact: true });
  const fmtUsdCompact = (v: number) => fmtUsd(v, { compact: true });
  const [tf, setTf] = useState<TimeFrame>("1d");
  const [tab, setTab] = useState<Tab>("overview");
  const [nftData, setNftData] = useState<WalletNfts[]>([]);
  const [defiData, setDefiData] = useState<WalletDefi[]>([]);

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

  // Wallets com endereço (filtradas)
  const addressedWallets = wallets.filter(w => w.address);

  // ── Fetch NFTs quando a tab NFTs é selecionada ──────────────────────────
  useEffect(() => {
    if (tab !== "nfts") return;
    if (nftData.length > 0) return; // already loaded

    const targets = addressedWallets.map(w => ({
      address: w.address!,
      chain: SYMBOL_CHAIN[w.symbol] ?? "eth",
      label: w.label,
      url: nftUrl(w.address!, w.network, w.symbol),
    }));

    if (targets.length === 0) return;

    const initial: WalletNfts[] = targets.map(t => ({ ...t, nfts: [], loading: true }));
    setNftData(initial);

    targets.forEach(async (t, i) => {
      try {
        const res = await fetch(t.url);
        const data = (await res.json()) as { nfts?: NftItem[]; count?: number; error?: string };
        setNftData(prev => {
          const next = [...prev];
          next[i] = { ...next[i], nfts: data.nfts ?? [], loading: false, error: data.error };
          return next;
        });
      } catch (e) {
        setNftData(prev => {
          const next = [...prev];
          next[i] = { ...next[i], loading: false, error: e instanceof Error ? e.message : "Erro" };
          return next;
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Fetch DeFi quando a tab DeFi é selecionada ─────────────────────────
  useEffect(() => {
    if (tab !== "defi") return;
    if (defiData.length > 0) return;

    // DeFi supported chains: eth and sol
    const targets = addressedWallets
      .filter(w => ["ETH", "SOL"].includes(w.symbol))
      .map(w => ({
        address: w.address!,
        chain: SYMBOL_CHAIN[w.symbol] ?? "eth",
        label: w.label,
        url: defiUrl(w.address!, w.network, w.symbol),
      }));

    if (targets.length === 0) return;

    const initial: WalletDefi[] = targets.map(t => ({ ...t, total: 0, positions: [], loading: true }));
    setDefiData(initial);

    targets.forEach(async (t, i) => {
      try {
        const res = await fetch(t.url);
        const data = (await res.json()) as { total?: number; positions?: DefiPosition[]; error?: string };
        setDefiData(prev => {
          const next = [...prev];
          next[i] = { ...next[i], total: data.total ?? 0, positions: data.positions ?? [], loading: false, error: data.error };
          return next;
        });
      } catch (e) {
        setDefiData(prev => {
          const next = [...prev];
          next[i] = { ...next[i], loading: false, error: e instanceof Error ? e.message : "Erro" };
          return next;
        });
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const totalNfts = nftData.reduce((s, w) => s + w.nfts.length, 0);
  const totalDefi = defiData.reduce((s, w) => s + w.total, 0);

  return (
    <div className="space-y-0">
      {/* ── Chart Card ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          <p className="text-4xl font-black text-white tracking-tight">{fmt(portfolioTotal)}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className={`text-sm ${isUp ? "text-emerald-400" : "text-rose-400"}`}>
              {isUp ? "▲" : "▼"} {fmt(Math.abs(pnlToday))} ({Math.abs(pnlPct).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%) hoje
            </span>
          </div>
        </div>
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
              <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fmtCompact} width={72} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="value" stroke={chartColor} strokeWidth={2} fill="url(#portGrad)"
                dot={false} activeDot={{ r: 4, fill: chartColor, stroke: "#0f172a", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-1 px-4 pb-4 pt-2">
          {TIMEFRAMES.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => setTf(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                tf === key ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white hover:bg-slate-800"
              }`}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-0 border-b border-slate-800 mt-6">
        {TABS.map(({ key, labelKey }) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={`px-4 py-3 text-sm font-medium transition border-b-2 -mb-px flex items-center gap-1.5 ${
              tab === key ? "border-blue-500 text-white" : "border-transparent text-slate-400 hover:text-white"
            }`}>
            {t(labelKey as Parameters<typeof t>[0])}
            {key === "nfts" && totalNfts > 0 && (
              <span className="text-[10px] bg-slate-700 text-slate-300 rounded-full px-1.5 py-0.5">{hideBalances ? "••••" : totalNfts}</span>
            )}
            {key === "defi" && totalDefi > 0 && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 rounded-full px-1.5 py-0.5">{fmtUsdCompact(totalDefi)}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: Tokens ── */}
      {tab === "tokens" && (
        <div className="rounded-b-2xl bg-slate-900/40 border border-t-0 border-slate-800 overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-sm font-bold text-white">{t("pcs_assets_value")}</h3>
            <p className="text-xs text-slate-500 mt-0.5">{t("pcs_sorted")}</p>
          </div>
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <span className="flex-1">{t("pcs_token")}</span>
            <span className="w-24 text-right">{t("pcs_price")}</span>
            <span className="w-24 text-right">{t("pcs_balance")}</span>
            <span className="w-24 text-right">{t("pcs_value")}</span>
            <span className="w-28 text-right">{t("pcs_unrealized")}</span>
          </div>
          <div className="px-4">
            {wallets.filter(w => (parseFloat(w.balance ?? "0") || 0) * (priceMap[w.symbol] ?? 0) >= 0.01).length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">{t("pcs_no_token")}<br /><a href="/wallets" className="text-orange-400 underline text-xs">{t("pcs_connect_wallet")}</a></p>
            ) : [...wallets]
                .sort((a, b) => {
                  const va = (parseFloat(a.balance ?? "0") || 0) * (priceMap[a.symbol] ?? 0);
                  const vb = (parseFloat(b.balance ?? "0") || 0) * (priceMap[b.symbol] ?? 0);
                  return vb - va;
                })
                .map((w, i) => (
                  <TokenRow key={`${w.symbol}-${i}`} wallet={w} price={priceMap[w.symbol] ?? 0} pnlToday={pnlToday} total={portfolioTotal} />
                ))}
          </div>
          {(() => {
            const walletTotal = wallets.reduce((sum, w) => {
              const val = (parseFloat(w.balance ?? "0") || 0) * (priceMap[w.symbol] ?? 0);
              return sum + (val >= 0.01 ? val : 0);
            }, 0);
            return walletTotal > 0 ? (
              <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
                <span className="text-xs text-slate-500">{t("pcs_total_blockchain")}</span>
                <span className="text-sm font-bold text-white">{fmt(walletTotal)}</span>
              </div>
            ) : null;
          })()}
        </div>
      )}

      {/* ── Tab: NFTs ── */}
      {tab === "nfts" && (
        <div className="rounded-b-2xl bg-slate-900/40 border border-t-0 border-slate-800 p-4">
          {hideBalances ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">🙈</p>
              <p className="text-sm font-semibold tracking-widest text-slate-400 select-none">••••</p>
            </div>
          ) : addressedWallets.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">🖼️</p>
              <p className="text-sm font-semibold text-white">{t("pcs_no_wallets")}</p>
              <p className="text-xs text-slate-400 mt-1"><a href="/wallets" className="text-orange-400 underline">{t("pcs_connect_wallet")}</a></p>
            </div>
          ) : (
            <div className="space-y-6">
              {nftData.map((wd) => (
                <div key={wd.address}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-slate-300">{wd.label}</span>
                    <span className="text-[10px] text-slate-600 font-mono">{wd.address.slice(0, 6)}…{wd.address.slice(-4)}</span>
                    <span className="text-[10px] border border-slate-700 text-slate-500 rounded px-1">{wd.chain.toUpperCase()}</span>
                    {wd.nfts.length > 0 && <span className="text-[10px] text-slate-400 ml-auto">{wd.nfts.length} NFTs</span>}
                  </div>
                  {wd.loading ? (
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="aspect-square rounded-xl bg-slate-800 animate-pulse" />
                      ))}
                    </div>
                  ) : wd.error ? (
                    <p className="text-xs text-rose-400 py-2">{wd.error}</p>
                  ) : wd.nfts.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">{t("pcs_no_nft")}</p>
                  ) : (
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                      {wd.nfts.map((nft) => (
                        <NftCard key={nft.id} nft={nft} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: DeFi ── */}
      {tab === "defi" && (
        <div className="rounded-b-2xl bg-slate-900/40 border border-t-0 border-slate-800 p-4">
          {addressedWallets.filter(w => ["ETH", "SOL"].includes(w.symbol)).length === 0 ? (
            <div className="text-center py-8">
              <p className="text-3xl mb-2">⚡</p>
              <p className="text-sm font-semibold text-white">{t("pcs_no_ethsol")}</p>
              <p className="text-xs text-slate-400 mt-1"><a href="/wallets" className="text-orange-400 underline">{t("pcs_connect_wallet")}</a></p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Summary */}
              {totalDefi > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                  <span className="text-sm text-slate-300">{t("pcs_total_defi")}</span>
                  <span className="text-lg font-black text-emerald-400">{fmtUsd(totalDefi)}</span>
                </div>
              )}

              {defiData.map((wd) => (
                <div key={wd.address} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-slate-300">{wd.label}</span>
                    <span className="text-[10px] text-slate-600 font-mono">{wd.address.slice(0, 6)}…{wd.address.slice(-4)}</span>
                    <span className="text-[10px] border border-slate-700 text-slate-500 rounded px-1">{wd.chain.toUpperCase()}</span>
                    {wd.total > 0 && (
                      <span className="ml-auto text-sm font-bold text-emerald-400">{fmtUsd(wd.total)}</span>
                    )}
                  </div>
                  {wd.loading ? (
                    <div className="space-y-2">
                      {[1, 2].map(i => <div key={i} className="h-8 rounded-lg bg-slate-800 animate-pulse" />)}
                    </div>
                  ) : wd.error ? (
                    <p className="text-xs text-rose-400">{wd.error}</p>
                  ) : wd.total === 0 ? (
                    <p className="text-xs text-slate-500">{t("pcs_no_defi")}</p>
                  ) : (
                    <div className="space-y-2">
                      {wd.positions.map((pos, i) => (
                        <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-800/50 last:border-0">
                          <div className="flex items-center gap-2">
                            <div className="h-6 w-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs">⚡</div>
                            <span className="text-sm text-slate-300">{pos.name}</span>
                          </div>
                          <span className="text-sm font-semibold text-emerald-400">{fmtUsd(pos.usd)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Overview spacer ── */}
      {tab === "overview" && <div className="py-2" />}
    </div>
  );
}
