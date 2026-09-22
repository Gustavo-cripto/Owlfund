"use client";

import Link from "next/link";
import { useState, useMemo, useEffect, useRef } from "react";
import { userError } from "@/lib/ui/userError";
import ErrorNote from "@/components/ErrorNote";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import dynamic from "next/dynamic";
import NftImage from "@/components/NftImage";
import { combineSeries, MOVING_AVERAGES, maKey, TF, type Bar, type MovingAverage, type SeriesBySymbol, type Timeframe } from "@/lib/portfolio/history";
import { loadFxTable } from "@/lib/fx/historical";
import { loadCryptoHoldings, type CryptoHoldings } from "@/lib/crypto/storage";
import { ACCOUNTS_EVENT } from "@/lib/portfolios/accounts";
import type { ChartMode } from "@/components/PortfolioHistoryChart";

// A biblioteca do grafico (~45 KB) so entra quando esta seccao aparece.
const PortfolioHistoryChart = dynamic(() => import("@/components/PortfolioHistoryChart"), { ssr: false });
import type { TranslationKey } from "@/lib/i18n/translations";

const LOCALE_BY_LANG: Record<string, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };

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

const TIMEFRAMES: { key: TimeFrame; labelKey: TranslationKey }[] = [
  { key: "1h",   labelKey: "pcs_tf_1h" },
  { key: "1d",   labelKey: "pcs_tf_1d" },
  { key: "1s",   labelKey: "pcs_tf_1w" },
  { key: "1m",   labelKey: "pcs_tf_1m" },
  { key: "1a",   labelKey: "pcs_tf_1y" },
  { key: "tudo", labelKey: "pcs_tf_all" },
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
// Emprestimos (kind "lending") trazem depositado e emprestado; `usd` e o liquido.
type DefiPosition = { name: string; usd: number; kind?: "lending"; supplied?: number; borrowed?: number; healthFactor?: number | null };

type WalletNfts = { address: string; chain: string; label: string; nfts: NftItem[]; loading: boolean; error?: string };
type WalletDefi = { address: string; chain: string; label: string; total: number; positions: DefiPosition[]; loading: boolean; error?: string; partial?: boolean };


// Devolve só pontos REAIS (snapshots + valor atual). Sem snapshots no intervalo
// devolve [] e o gráfico mostra um estado vazio — antes inventava "Início = −3 %"
// e uma curva horária interpolada a fingir de histórico.
function buildChartData(
  tf: TimeFrame,
  portfolioTotal: number,
  snapshotTotals: SnapshotTotal[],
  locale: string,
  nowLabel: string,
): Bar[] {
  const now = Date.now();
  const sorted = [...snapshotTotals].sort((a, b) => a.createdAt - b.createdAt);

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
  if (filtered.length === 0) return [];

  void locale; void nowLabel;
  const pts: Bar[] = filtered.map(s => ({ t: s.createdAt, o: s.total, h: s.total, l: s.total, c: s.total }));
  pts.push({ t: now, o: portfolioTotal, h: portfolioTotal, l: portfolioTotal, c: portfolioTotal });
  return pts;
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
            <span className="ml-1.5 rounded px-1 py-0.5 text-[11px] border border-slate-700 text-slate-500">{wallet.network}</span>
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
              {pnlPct >= 0 ? "▲" : "▼"} {hideBalances ? "••" : Math.abs(pnlPct).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
            </p>
          </>
        ) : <p className="text-sm text-slate-600">—</p>}
      </div>
    </div>
  );
}

// ── NFT card ─────────────────────────────────────────────────────────────────
function NftCard({ nft }: { nft: NftItem }) {
  const src = nft.image;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden hover:border-slate-600 transition group">
      <div className="aspect-square bg-slate-800 relative overflow-hidden">
        {src ? (
          <NftImage src={src} alt={nft.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl text-slate-600">🖼️</div>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-semibold text-white truncate">{nft.name || "NFT"}</p>
        {nft.tokenId && <p className="text-[11px] text-slate-500">#{String(nft.tokenId).slice(0, 8)}</p>}
      </div>
    </div>
  );
}

// ── Main export ─────────────────────────────────────────────────────────────
export default function PortfolioChartSection({
  portfolioTotal, pnlToday, snapshotTotals, historicalPrices,
  wallets, tokenPrices,
}: Props) {
  const { t, lang } = useLanguage();
  const locale = LOCALE_BY_LANG[lang] ?? "pt-PT";
  const { format: fmt, formatUsd: fmtUsd, hideBalances, rates } = useCurrencyFormat();
  const fmtUsdCompact = (v: number) => fmtUsd(v, { compact: true });
  const [tf, setTf] = useState<TimeFrame>("1d");
  const [mode, setMode] = useState<ChartMode>("area");
  // Medias escolhidas (chaves como "sma20"), guardadas no browser.
  const [maKeys, setMaKeys] = useState<string[]>([]);
  const [maOpen, setMaOpen] = useState(false);
  useEffect(() => { try { const raw = localStorage.getItem("cfa-chart-ma"); if (raw) setMaKeys(JSON.parse(raw)); } catch { /* ignore */ } }, []);
  const toggleMa = (k: string) => setMaKeys((prev) => { const next = prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]; try { localStorage.setItem("cfa-chart-ma", JSON.stringify(next)); } catch { /* ignore */ } return next; });
  const [hover, setHover] = useState<{ t: number; value: number } | null>(null);
  const [history, setHistory] = useState<{ tf: TimeFrame; bars: Bar[] } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");
  // Sublinhado dos tabs: mede o botao ativo e desliza ate la. Re-mede quando
  // o texto muda (lingua, badges de NFTs/DeFi) ou a janela muda de tamanho.
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const [tabInd, setTabInd] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const measure = () => {
      const el = tabRefs.current[tab];
      if (el) setTabInd({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });
  // Cripto manual com quantidade (lida do mesmo sitio que a pagina de Carteiras).
  const [manualCrypto, setManualCrypto] = useState<CryptoHoldings>({});
  useEffect(() => {
    const load = () => { try { setManualCrypto(loadCryptoHoldings()); } catch { setManualCrypto({}); } };
    load();
    window.addEventListener(ACCOUNTS_EVENT, load);
    return () => window.removeEventListener(ACCOUNTS_EVENT, load);
  }, []);
  const [nftData, setNftData] = useState<WalletNfts[]>([]);
  const [defiData, setDefiData] = useState<WalletDefi[]>([]);

  const nowLabel = t("pcs_now");
  const snapshotBars = useMemo(
    () => buildChartData(tf, portfolioTotal, snapshotTotals, locale, nowLabel),
    [tf, portfolioTotal, snapshotTotals, locale, nowLabel]
  );
  void historicalPrices;

  // Quantidades por ativo com vela (carteiras on-chain + cripto manual com
  // quantidade). O resto do portefolio (tradicionais, stablecoins, tokens,
  // DeFi, CEX) e constante ao longo do intervalo.
  const quantities = useMemo(() => {
    const q: Record<string, number> = {};
    for (const w of wallets) { const n = Number(w.balance ?? 0); if (n > 0 && w.symbol) q[w.symbol] = (q[w.symbol] ?? 0) + n; }
    for (const [sym, h] of Object.entries(manualCrypto)) { if ((h.quantity ?? 0) > 0) q[sym] = (q[sym] ?? 0) + (h.quantity ?? 0); }
    return q;
  }, [wallets, manualCrypto]);
  const symbolsKey = Object.keys(quantities).sort().join(",");

  // Historico reconstruido: velas dos ativos (USD, OKX) → euros a taxa da
  // data → soma ponderada + parte constante. "tudo" fica com os snapshots.
  useEffect(() => {
    if (tf === "tudo" || !symbolsKey) { setHistory(null); return; }
    let cancelled = false;
    setHistoryLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/portfolio-history?tf=${tf}&symbols=${encodeURIComponent(symbolsKey)}`);
        if (!res.ok) throw new Error(String(res.status));
        const j = (await res.json()) as { series: SeriesBySymbol };
        const series = j.series ?? {};
        const syms = Object.keys(series);
        if (syms.length === 0) { if (!cancelled) setHistory({ tf, bars: [] }); return; }
        // USD → EUR: intradiario a taxa de hoje; a partir da semana, a taxa de cada dia.
        const usdToEur = tokenPrices.usdToEur && tokenPrices.usdToEur > 0 ? tokenPrices.usdToEur : 1 / (rates.USD || 1.08);
        let convert = (usd: number, _t: number) => usd * usdToEur; // eslint-disable-line @typescript-eslint/no-unused-vars
        if (TF[tf as Timeframe].ms >= 3_600_000) {
          const dates = [...new Set(syms.flatMap((s) => series[s].map((b) => new Date(b.t).toISOString().slice(0, 10))))].sort();
          const tabela = await loadFxTable([dates[0], dates[dates.length - 1]], ["USD"]);
          convert = (usd, t) => { const v = tabela.convert(usd, "USD", "EUR", new Date(t).toISOString().slice(0, 10)); return v == null ? usd * usdToEur : v; };
        }
        const eurSeries: SeriesBySymbol = {};
        const scale: Record<string, number> = {};
        for (const s of syms) {
          eurSeries[s] = series[s].map((b) => ({ t: b.t, o: convert(b.o, b.t), h: convert(b.h, b.t), l: convert(b.l, b.t), c: convert(b.c, b.t) }));
          // A serie acaba exatamente no preco que a app mostra hoje.
          const lastEur = eurSeries[s][eurSeries[s].length - 1].c;
          const appPrice = tokenPrices[s];
          scale[s] = appPrice && appPrice > 0 && lastEur > 0 ? appPrice / lastEur : 1;
        }
        const covered = syms.reduce((sum, s) => sum + (quantities[s] ?? 0) * (tokenPrices[s] ?? eurSeries[s][eurSeries[s].length - 1].c * (scale[s] ?? 1)), 0);
        const constant = Math.max(0, portfolioTotal - covered);
        const bars = combineSeries(eurSeries, quantities, scale, constant);
        if (!cancelled) setHistory({ tf, bars });
      } catch {
        if (!cancelled) setHistory({ tf, bars: [] });
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // portfolioTotal muda a cada refresh de precos; recalcula-se com as barras ja em memoria (abaixo) e nao volta a ir a rede
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tf, symbolsKey]);

  const bars: Bar[] = tf !== "tudo" && history?.tf === tf && history.bars.length >= 2 ? history.bars : snapshotBars;
  const reconstructed = tf !== "tudo" && history?.tf === tf && history.bars.length >= 2;
  const intraday = tf === "1h" || tf === "1d";
  // Variacao DO INTERVALO escolhido (nao so "hoje"): primeiro vs ultimo ponto.
  const first = bars[0]?.o ?? bars[0]?.c ?? 0;
  const last = bars[bars.length - 1]?.c ?? portfolioTotal;
  const rangeDelta = bars.length >= 2 ? last - first : pnlToday;
  const rangePct = first > 0 && bars.length >= 2 ? (rangeDelta / first) * 100 : (portfolioTotal > 0 ? (pnlToday / portfolioTotal) * 100 : 0);
  const isUp = rangeDelta >= 0;
  const averages = useMemo<MovingAverage[]>(() => MOVING_AVERAGES.filter((m) => maKeys.includes(maKey(m))).map(({ kind, n }) => ({ kind, n })), [maKeys]);
  // Eixo dos precos: compacto so acima de 100 mil. Abaixo disso "€ 3.4K" repetia-se
  // em todas as linhas do eixo quando o intervalo era de poucas dezenas de euros.
  const fmtStable = useMemo(() => (v: number) => (Math.abs(v) >= 100_000 ? fmt(v, { compact: true }) : fmt(v, { decimals: Math.abs(v) < 100 ? 2 : 0 })), [fmt]);
  const rangeLabel: Record<TimeFrame, TranslationKey> = { "1h": "pcs_rg_1h", "1d": "pcs_rg_1d", "1s": "pcs_rg_1w", "1m": "pcs_rg_1m", "1a": "pcs_rg_1y", "tudo": "pcs_rg_all" };

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
    let cancelled = false;

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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { nfts?: NftItem[]; count?: number; error?: string };
        if (cancelled) return;
        setNftData(prev => {
          const next = [...prev];
          next[i] = { ...next[i], nfts: data.nfts ?? [], loading: false, error: data.error };
          return next;
        });
      } catch (e) {
        if (cancelled) return;
        setNftData(prev => {
          const next = [...prev];
          next[i] = { ...next[i], loading: false, error: userError(e, "—") };
          return next;
        });
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Fetch DeFi quando a tab DeFi é selecionada ─────────────────────────
  useEffect(() => {
    if (tab !== "defi") return;
    if (defiData.length > 0) return;
    let cancelled = false;

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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { total?: number; positions?: DefiPosition[]; error?: string; partial?: boolean };
        if (cancelled) return;
        setDefiData(prev => {
          const next = [...prev];
          next[i] = { ...next[i], total: data.total ?? 0, positions: data.positions ?? [], loading: false, error: data.error, partial: data.partial === true };
          return next;
        });
      } catch (e) {
        if (cancelled) return;
        setDefiData(prev => {
          const next = [...prev];
          next[i] = { ...next[i], loading: false, error: userError(e, "—") };
          return next;
        });
      }
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const totalNfts = nftData.reduce((s, w) => s + w.nfts.length, 0);
  const totalDefi = defiData.reduce((s, w) => s + w.total, 0);

  return (
    <div className="space-y-0">
      {/* ── Chart Card ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
        <div className="px-6 pt-6 pb-2">
          {/* Com a cruz sobre o grafico, o cabecalho mostra esse instante; sem ela, o valor atual. */}
          <p className="text-4xl font-black text-white tracking-tight">{fmt(hover ? hover.value : portfolioTotal)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {hover ? (
              <span className="text-sm text-slate-400">
                {new Date(hover.t).toLocaleString(locale, intraday ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", year: "numeric" })}
                {" · "}
                <span className={hover.value - first >= 0 ? "text-emerald-400" : "text-rose-400"}>
                  {hover.value - first >= 0 ? "+" : "−"}{fmt(Math.abs(hover.value - first))} {t("pcs_since_start")}
                </span>
              </span>
            ) : (
              <span className={`text-sm ${isUp ? "text-emerald-400" : "text-rose-400"}`}>
                {isUp ? "▲" : "▼"} {fmt(Math.abs(rangeDelta))} ({hideBalances ? "••" : Math.abs(rangePct).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%) {t(rangeLabel[tf])}
              </span>
            )}
          </div>
        </div>
        <div className="relative h-[260px] px-2 mt-2">
          {bars.length < 2 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-xs text-slate-500">{historyLoading ? t("loading") : t("pcs_no_history")}</div>
          ) : (
            <PortfolioHistoryChart bars={bars} mode={reconstructed ? mode : "area"} averages={reconstructed ? averages : []} intraday={intraday} up={isUp} format={fmtStable} locale={locale} onHover={setHover} />
          )}
          {historyLoading && bars.length >= 2 && <div className="pointer-events-none absolute right-4 top-2 text-[11px] text-slate-500">{t("loading")}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-1 px-4 pb-1 pt-2">
          {TIMEFRAMES.map(({ key, labelKey }) => (
            <button key={key} type="button" onClick={() => setTf(key)} aria-pressed={tf === key}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                tf === key ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white hover:bg-slate-800"
              }`}>{t(labelKey)}</button>
          ))}
        </div>
        {reconstructed && (
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pb-2">
            <div className="flex rounded-full border border-slate-700 p-0.5" role="radiogroup" aria-label={t("pcs_chart_type")}>
              {(["area", "candles"] as ChartMode[]).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${mode === m ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white"}`}>
                  {m === "area" ? `〜 ${t("pcs_mode_line")}` : `▮ ${t("pcs_mode_candles")}`}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setMaOpen((v) => !v)} aria-expanded={maOpen} aria-controls="pcs-ma-panel"
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${maKeys.length ? "border-amber-500/50 bg-amber-500/10 text-amber-300" : "border-slate-700 text-slate-500 hover:text-white"}`}>
              {t("pcs_ma")}{maKeys.length ? ` · ${maKeys.length}` : ""} {maOpen ? "▴" : "▾"}
            </button>
          </div>
        )}
        {reconstructed && maOpen && (
          // Painel no fluxo da pagina (nao flutuante): o cartao tem overflow-hidden e
          // um menu absoluto ficava cortado — foi o que aconteceu no telemovel.
          <div id="pcs-ma-panel" className="mx-4 mb-2 rounded-xl border border-slate-800 bg-slate-950/50 p-3" role="group" aria-label={t("pcs_ma")}>
            <div className="flex flex-wrap gap-1.5">
              {MOVING_AVERAGES.map((m) => {
                const k = maKey(m);
                const on = maKeys.includes(k);
                const enough = bars.length >= m.n + 1;
                return (
                  <button key={k} type="button" onClick={() => enough && toggleMa(k)} aria-pressed={on} disabled={!enough}
                    title={enough ? "" : t("pcs_ma_needs").replace("{n}", String(m.n + 1))}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition ${!enough ? "cursor-not-allowed border-slate-800 text-slate-600" : on ? "border-slate-500 bg-slate-800 text-white" : "border-slate-700 text-slate-400 hover:text-white"}`}>
                    <span className="inline-block w-4 rounded" style={{ borderTop: `2px ${m.kind === "ema" ? "dashed" : "solid"} ${enough ? m.color : "#334155"}` }} />
                    {m.kind.toUpperCase()} {m.n}
                  </button>
                );
              })}
              {maKeys.length > 0 && (
                <button type="button" onClick={() => { setMaKeys([]); try { localStorage.removeItem("cfa-chart-ma"); } catch { /* ignore */ } }} className="rounded-full px-2.5 py-1 text-[11px] text-slate-500 hover:text-white">{t("pcs_ma_clear")}</button>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{t("pcs_ma_help")}</p>
          </div>
        )}
        {reconstructed && averages.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 px-6 pb-1 text-[11px] text-slate-400">
            {MOVING_AVERAGES.filter((m) => maKeys.includes(maKey(m))).map((m) => (
              <span key={maKey(m)} className="inline-flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded" style={{ backgroundColor: m.color }} />
                {m.kind.toUpperCase()} {m.n}{bars.length < m.n + 1 ? ` (${t("pcs_ma_needs").replace("{n}", String(m.n + 1))})` : ""}
              </span>
            ))}
          </div>
        )}
        <p className="px-6 pb-4 text-[11px] text-slate-600">{reconstructed ? t("pcs_reconstructed_note") : t("pcs_snapshots_note")}</p>
      </div>

      {/* ── Tabs ── */}
      <div className="relative flex gap-0 border-b border-slate-800 mt-6">
        {TABS.map(({ key, labelKey }) => (
          <button key={key} type="button" onClick={() => setTab(key)} ref={(el) => { tabRefs.current[key] = el; }}
            className={`press px-4 py-3 text-sm font-medium flex items-center gap-1.5 ${
              tab === key ? "text-white" : "text-slate-400 hover:text-white"
            }`}>
            {t(labelKey as Parameters<typeof t>[0])}
            {key === "nfts" && totalNfts > 0 && (
              <span className="text-[11px] bg-slate-700 text-slate-300 rounded-full px-1.5 py-0.5">{hideBalances ? "••••" : totalNfts}</span>
            )}
            {key === "defi" && totalDefi > 0 && (
              <span className="text-[11px] bg-emerald-500/20 text-emerald-400 rounded-full px-1.5 py-0.5">{fmtUsdCompact(totalDefi)}</span>
            )}
          </button>
        ))}
        {/* Sublinhado que desliza até ao tab ativo (em vez de saltar). */}
        {tabInd && (
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-px left-0 h-0.5 bg-blue-500 transition-[transform,width] duration-[250ms] ease-[var(--ease-in-out)] motion-reduce:transition-none"
            style={{ transform: `translateX(${tabInd.left}px)`, width: tabInd.width }} />
        )}
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
              <p className="text-sm text-slate-500 py-8 text-center">{t("pcs_no_token")}<br /><Link href="/wallets" className="text-orange-400 underline text-xs">{t("pcs_connect_wallet")}</Link></p>
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
              <p className="text-xs text-slate-400 mt-1"><Link href="/wallets" className="text-orange-400 underline">{t("pcs_connect_wallet")}</Link></p>
            </div>
          ) : (
            <div className="space-y-6">
              {nftData.map((wd) => (
                <div key={`${wd.address}-${wd.chain}-${wd.label}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-slate-300">{wd.label}</span>
                    <span className="text-[11px] text-slate-600 font-mono">{wd.address.slice(0, 6)}…{wd.address.slice(-4)}</span>
                    <span className="text-[11px] border border-slate-700 text-slate-500 rounded px-1">{wd.chain.toUpperCase()}</span>
                    {wd.nfts.length > 0 && <span className="text-[11px] text-slate-400 ml-auto">{wd.nfts.length} NFTs</span>}
                  </div>
                  {wd.loading ? (
                    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="aspect-square rounded-xl bg-slate-800 animate-pulse" />
                      ))}
                    </div>
                  ) : wd.error ? (
                    <ErrorNote>{wd.error}</ErrorNote>
                  ) : wd.nfts.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">{t("pcs_no_nft")}</p>
                  ) : (
                    <div className="animate-reveal grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
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
              <p className="text-xs text-slate-400 mt-1"><Link href="/wallets" className="text-orange-400 underline">{t("pcs_connect_wallet")}</Link></p>
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
                <div key={`${wd.address}-${wd.chain}-${wd.label}`} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xs font-semibold text-slate-300">{wd.label}</span>
                    <span className="text-[11px] text-slate-600 font-mono">{wd.address.slice(0, 6)}…{wd.address.slice(-4)}</span>
                    <span className="text-[11px] border border-slate-700 text-slate-500 rounded px-1">{wd.chain.toUpperCase()}</span>
                    {wd.positions.length > 0 && (
                      <span className={`ml-auto text-sm font-bold ${wd.total >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtUsd(wd.total)}</span>
                    )}
                  </div>
                  {wd.loading ? (
                    <div className="space-y-2">
                      {[1, 2].map(i => <div key={i} className="h-8 rounded-lg bg-slate-800 animate-pulse" />)}
                    </div>
                  ) : wd.error ? (
                    <ErrorNote>{wd.error}</ErrorNote>
                  ) : wd.positions.length === 0 ? (
                    <p className="text-xs text-slate-500">{t("pcs_no_defi")}{wd.partial ? ` ${t("pcs_defi_partial")}` : ""}</p>
                  ) : (
                    <div className="animate-reveal space-y-2">
                      {wd.positions.map((pos, i) => (
                        <div key={i} className="py-1.5 border-b border-slate-800/50 last:border-0">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-violet-500/20 flex items-center justify-center text-xs">{pos.kind === "lending" ? "🏦" : "⚡"}</div>
                              <span className="text-sm text-slate-300">{pos.name}</span>
                            </div>
                            <span className={`text-sm font-semibold ${pos.usd >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{fmtUsd(pos.usd)}</span>
                          </div>
                          {pos.kind === "lending" && (
                            <div className="mt-1 ml-8 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                              <span>{t("pcs_defi_supplied")} <span className="text-slate-300">{fmtUsd(pos.supplied ?? 0)}</span></span>
                              {(pos.borrowed ?? 0) > 0 && <span>{t("pcs_defi_borrowed")} <span className="text-rose-300">−{fmtUsd(pos.borrowed ?? 0)}</span></span>}
                              {pos.healthFactor != null && (
                                <span title={t("pcs_defi_hf_help")}>{t("pcs_defi_hf")} <span className={pos.healthFactor < 1.2 ? "text-rose-400" : pos.healthFactor < 1.5 ? "text-amber-300" : "text-slate-300"}>{pos.healthFactor.toFixed(2)}</span></span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {wd.positions.some((p) => p.kind === "lending") && (
                        <p className="pt-1 text-[11px] text-slate-600">{t("pcs_defi_net_note")}</p>
                      )}
                      {wd.partial && <p className="pt-1 text-[11px] text-slate-600">{t("pcs_defi_partial")}</p>}
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
