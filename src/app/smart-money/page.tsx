"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { KNOWN_WHALES } from "@/lib/api/known-whales";
import { btnPrimary } from "@/lib/ui/buttons";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const STORAGE_KEY = "smart-money-watchlist";
const ALERTS_KEY = "smart-money-alerts";

const sanitizeLabel = (label: string): string =>
  label.replace(/[<>"'`]/g, "").replace(/javascript:/gi, "").trim().slice(0, 64);

type WatchEntry = {
  address: string;
  label: string;
  chain: "eth" | "sol" | "btc";
  addedAt: number;
};

type TokenBalance = {
  address: string;
  symbol: string;
  name: string;
  logo?: string;
  balance: string;
  usdValue: number;
  usdPrice: number;
};

type WalletData = {
  tokens: TokenBalance[];
  totalUsd: number;
  loading: boolean;
  error: string | null;
  fetchedAt?: number;
};

type WhaleTx = {
  hash: string;
  direction: "in" | "out";
  symbol: string;
  tokenName: string;
  usdValue: number;
  amount: string;
  timestamp: number;
  from: string;
  to: string;
  isBigMove: boolean;
};

type TxData = {
  txs: WhaleTx[];
  loading: boolean;
  error: string | null;
};

type AlertEntry = {
  id: string;
  whale: string;
  whaleAddress: string;
  tx: WhaleTx;
  seenAt: number;
};


function loadWatchlist(): WatchEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WatchEntry[]) : [];
  } catch { return []; }
}

function saveWatchlist(list: WatchEntry[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

function loadAlerts(): AlertEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(ALERTS_KEY);
    return raw ? (JSON.parse(raw) as AlertEntry[]) : [];
  } catch { return []; }
}

function saveAlerts(alerts: AlertEntry[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts.slice(0, 100))); } catch {}
}

function shortAddr(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// Locale de UI a partir de <html lang> (o LanguageContext mantém-no em sincronia).
const uiLocale = () => {
  const l = typeof document !== "undefined" ? document.documentElement.lang : "pt";
  return ({ pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" } as Record<string, string>)[l] ?? "pt-PT";
};

function formatUsd(v: number) {
  return new Intl.NumberFormat(uiLocale(), { style: "currency", currency: "USD", notation: v >= 1_000 ? "compact" : "standard", maximumFractionDigits: v >= 1_000 ? 2 : 2 }).format(v);
}

// Explorador por tipo de hash: txid BTC = 64 hex sem 0x; ETH = 0x + 64 hex.
const txExplorer = (hash: string) => (/^[0-9a-fA-F]{64}$/.test(hash) ? `https://mempool.space/tx/${hash}` : `https://etherscan.io/tx/${hash}`);

function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ── Sub-components ──────────────────────────────────────────────────────────

function TxRow({ tx, whaleName }: { tx: WhaleTx; whaleName?: string }) {
  const { t } = useLanguage();
  const isIn = tx.direction === "in";
  return (
    <div className={`flex items-center gap-3 py-2.5 border-b border-slate-800/50 last:border-0 ${tx.isBigMove ? "bg-orange-500/5 -mx-4 px-4 rounded-lg" : ""}`}>
      <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
        isIn ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
      }`}>
        {isIn ? "↓" : "↑"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {whaleName && <span className="text-xs text-orange-400 font-medium truncate max-w-[120px]">{whaleName}</span>}
          <span className="text-sm font-semibold text-white">{tx.amount} {tx.symbol}</span>
          {tx.isBigMove && (
            <span className="text-[10px] bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full px-1.5 py-0.5">
              🐋 {t("sm_big_move")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-slate-500 font-mono">{shortAddr(isIn ? tx.from : tx.to)}</span>
          <span className="text-[10px] text-slate-600">·</span>
          <span className="text-[10px] text-slate-500">{timeAgo(tx.timestamp)} {t("sm2_ago")}</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-bold ${isIn ? "text-emerald-400" : "text-rose-400"}`}>
          {isIn ? "+" : "-"}{formatUsd(tx.usdValue)}
        </p>
        <a
          href={txExplorer(tx.hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-slate-600 hover:text-orange-400 transition"
        >
          {t("sm2_view")} ↗
        </a>
      </div>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

const FREE_WHALE_LIMIT = 3;

export default function SmartMoneyPage() {
  const { isLoading, userId } = useRequireAuth("/login");
  const { t } = useLanguage();
  const [isPro, setIsPro] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [planKnown, setPlanKnown] = useState(false);
  // Durante o beta (pagamentos congelados) os CTAs de upgrade viram convite ao beta.
  const paymentsFrozen = process.env.NEXT_PUBLIC_PAYMENTS_ENABLED !== "true";
  const upgradeHref = paymentsFrozen ? "/beta" : "/pricing";
  const [tab, setTab] = useState<"watchlist" | "history" | "alerts">("watchlist");
  const [watchlist, setWatchlist] = useState<WatchEntry[]>([]);
  const [walletData, setWalletData] = useState<Record<string, WalletData>>({});
  const [txData, setTxData] = useState<Record<string, TxData>>({});
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [newAddress, setNewAddress] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newChain, setNewChain] = useState<"eth" | "sol" | "btc">("eth");
  const [addError, setAddError] = useState<string | null>(null);
  const [addErrorIsLimit, setAddErrorIsLimit] = useState(false);
  const [knownQuery, setKnownQuery] = useState("");
  const [showKnown, setShowKnown] = useState(false);
  const [checkingAlerts, setCheckingAlerts] = useState(false);
  const [lastCheckResult, setLastCheckResult] = useState<"none" | "found" | null>(null);
  // null = ainda não escolhido (usa a 1.ª carteira); "" = vista "Todas"
  const [historyAddr, setHistoryAddr] = useState<string | null>(null);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const list = loadWatchlist();
    setWatchlist(list);
    setAlerts(loadAlerts());
    // só depois do render com a lista restaurada é que passamos a gravar
    const id = window.setTimeout(() => { hydratedRef.current = true; }, 0);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveWatchlist(watchlist);
  }, [watchlist]);

  // Sincroniza a watchlist para o servidor (só Premium) para os webhooks a
  // poderem varrer com a app fechada.
  useEffect(() => {
    if (!hydratedRef.current || !isPremium) return;
    const timer = setTimeout(() => {
      void fetch("/api/smart-money/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ watchlist: watchlist.map((e) => ({ address: e.address, chain: e.chain, label: e.label })) }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(timer);
  }, [watchlist, isPremium]);

  // Verificar subscrição via API server-side (evita dependência de NEXT_PUBLIC env var no cliente)
  useEffect(() => {
    if (!userId) return;
    const check = async () => {
      try {
        const res = await fetch("/api/subscription");
        if (res.ok) {
          const json = await res.json() as { plan: string };
          setIsPremium(json.plan === "premium");
          setIsPro(json.plan === "pro" || json.plan === "premium");
        }
      } catch { /* ignore */ } finally { setPlanKnown(true); }
    };
    check();
  }, [userId]);

  // Premium noutro dispositivo: se a lista local estiver vazia, puxar do servidor
  useEffect(() => {
    if (!isPremium || watchlist.length > 0) return;
    void fetch("/api/smart-money/watchlist").then((r) => (r.ok ? r.json() : null)).then((j: { watchlist?: { address: string; chain: "eth" | "sol" | "btc"; label: string }[] } | null) => {
      const rows = j?.watchlist ?? [];
      if (rows.length) setWatchlist(rows.map((r) => ({ address: r.address, chain: r.chain, label: r.label || shortAddr(r.address), addedAt: Date.now() })));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPremium]);

  const fetchWalletData = useCallback(async (entry: WatchEntry) => {
    const key = entry.address;
    setWalletData((prev) => ({ ...prev, [key]: { tokens: [], totalUsd: 0, loading: true, error: null } }));
    try {
      const res = await fetch(`/api/token-balances?address=${encodeURIComponent(entry.address)}&chain=${entry.chain}`);
      const data = (await res.json()) as { tokens?: TokenBalance[]; totalUsd?: number; error?: string };
      if (!res.ok || data.error) {
        setWalletData((prev) => ({ ...prev, [key]: { tokens: [], totalUsd: 0, loading: false, error: data.error ?? t("error") } }));
        return;
      }
      setWalletData((prev) => ({ ...prev, [key]: { tokens: data.tokens ?? [], totalUsd: data.totalUsd ?? 0, loading: false, error: null, fetchedAt: Date.now() } }));
    } catch (e) {
      setWalletData((prev) => ({ ...prev, [key]: { tokens: [], totalUsd: 0, loading: false, error: e instanceof Error ? e.message : t("error") } }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchTxData = useCallback(async (entry: WatchEntry) => {
    if (entry.chain === "sol") return; // Solana tx history not yet supported
    const key = entry.address;
    setTxData((prev) => ({ ...prev, [key]: { txs: [], loading: true, error: null } }));
    try {
      const res = await fetch(`/api/whale-txs?address=${encodeURIComponent(entry.address)}&chain=${entry.chain}`);
      const data = (await res.json()) as { txs?: WhaleTx[]; error?: string };
      if (!res.ok || data.error) {
        setTxData((prev) => ({ ...prev, [key]: { txs: [], loading: false, error: data.error ?? t("error") } }));
        return;
      }
      const txs = data.txs ?? [];
      setTxData((prev) => ({ ...prev, [key]: { txs, loading: false, error: null } }));
      // Generate alerts for big moves
      const bigMoves = txs.filter((tx) => tx.isBigMove);
      if (bigMoves.length > 0) {
        setAlerts((prev) => {
          const existing = new Set(prev.map((a) => a.id));
          const newAlerts: AlertEntry[] = bigMoves
            .map((tx) => ({
              id: tx.hash + entry.address,
              whale: entry.label,
              whaleAddress: entry.address,
              tx,
              seenAt: Date.now(),
            }))
            .filter((a) => !existing.has(a.id));
          return newAlerts.length ? [...newAlerts, ...prev].slice(0, 100) : prev;
        });
      }
    } catch (e) {
      setTxData((prev) => ({ ...prev, [key]: { txs: [], loading: false, error: e instanceof Error ? e.message : t("error") } }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    watchlist.forEach((entry) => {
      if (!walletData[entry.address]) fetchWalletData(entry);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist, fetchWalletData]);

  // Persistência dos alertas fora do updater (efeito puro)
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveAlerts(alerts);
  }, [alerts]);

  // Premium RT: auto-refresh todos os 60s
  useEffect(() => {
    if (!isPremium || watchlist.length === 0) return;
    const interval = setInterval(() => {
      watchlist.forEach((entry) => fetchWalletData(entry));
    }, 60_000);
    return () => clearInterval(interval);
  }, [isPremium, watchlist, fetchWalletData]);

  // Set default history address when switching to history tab
  useEffect(() => {
    if (tab !== "history") return;
    if (historyAddr === null && watchlist.length > 0) {
      const first = watchlist.find((e) => e.chain === "eth" || e.chain === "btc");
      if (first) {
        setHistoryAddr(first.address);
        if (!txData[first.address]) fetchTxData(first);
      }
    } else if (historyAddr === "") {
      // vista "Todas": carregar o que ainda falta
      watchlist.filter((e) => e.chain !== "sol" && !txData[e.address]).forEach(fetchTxData);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, watchlist, historyAddr]);

  const handleAdd = () => {
    setAddError(null);
    const addr = newAddress.trim();
    if (!addr) { setAddError(t("sm2_enter_addr")); return; }
    setAddErrorIsLimit(false);
    if (planKnown && !isPro && watchlist.length >= FREE_WHALE_LIMIT) {
      setAddError(`${t("sm2_free_limit_1")} ${FREE_WHALE_LIMIT} ${t("sm2_free_limit_2")}`);
      setAddErrorIsLimit(true);
      return;
    }
    const isEvm = /^0x[a-fA-F0-9]{40}$/.test(addr);
    const isSol = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
    const isBtc = /^(bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/.test(addr);
    if (newChain === "eth" && !isEvm) { setAddError(t("wl_invalid_evm")); return; }
    if (newChain === "sol" && !isSol) { setAddError(t("wl_invalid_sol")); return; }
    if (newChain === "btc" && !isBtc) { setAddError(t("wl_invalid_btc")); return; }
    if (watchlist.some((e) => e.address.toLowerCase() === addr.toLowerCase())) {
      setAddError(t("sm2_already")); return;
    }
    const entry: WatchEntry = {
      address: addr,
      label: newLabel.trim() ? sanitizeLabel(newLabel) : shortAddr(addr),
      chain: newChain,
      addedAt: Date.now(),
    };
    setWatchlist((prev) => [entry, ...prev]);
    setNewAddress("");
    setNewLabel("");
  };

  const handleRemove = (address: string) => {
    if (historyAddr === address) setHistoryAddr(null);
    setWatchlist((prev) => prev.filter((e) => e.address !== address));
    setWalletData((prev) => { const n = { ...prev }; delete n[address]; return n; });
    setTxData((prev) => { const n = { ...prev }; delete n[address]; return n; });
  };

  const handleAddKnown = (entry: WatchEntry) => {
    if (watchlist.some((e) => e.address.toLowerCase() === entry.address.toLowerCase())) return;
    if (planKnown && !isPro && watchlist.length >= FREE_WHALE_LIMIT) {
      setAddError(`${t("sm2_free_limit_1")} ${FREE_WHALE_LIMIT} ${t("sm2_free_limit_2")}`);
      setAddErrorIsLimit(true);
      setShowKnown(false);
      return;
    }
    setWatchlist((prev) => [{ ...entry, addedAt: Date.now() }, ...prev]);
    setShowKnown(false);
  };

  const handleHistorySelect = (addr: string) => {
    setHistoryAddr(addr);
    const entry = watchlist.find((e) => e.address === addr);
    if (entry && !txData[addr]) fetchTxData(entry);
  };

  const clearAlerts = () => {
    setAlerts([]);
    saveAlerts([]);
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <p className="text-sm text-slate-400 animate-pulse">{t("loading")}</p>
        </div>
      </AppShell>
    );
  }

  const ethWatchlist = watchlist.filter((e) => e.chain === "eth" || e.chain === "btc");
  const selectedEntry = watchlist.find((e) => e.address === historyAddr);
  const selectedTx = historyAddr ? txData[historyAddr] : undefined;
  const STARTERS = ["Vitalik", "Binance Cold", "MicroStrategy", "Coinbase Cold"];
  const starterWhales = STARTERS.map((k) => KNOWN_WHALES.find((w) => w.label.includes(k))).filter(Boolean) as typeof KNOWN_WHALES;
  const filteredKnown = KNOWN_WHALES.filter((w) => !knownQuery || w.label.toLowerCase().includes(knownQuery.toLowerCase()) || w.address.toLowerCase().includes(knownQuery.toLowerCase()));
  const unreadAlerts = alerts.filter((a) => Date.now() - a.seenAt < 24 * 60 * 60 * 1000).length;

  // Aggregate all txs for history (when no specific wallet selected)
  const allTxs = Object.entries(txData)
    .flatMap(([addr, data]) => {
      const whale = watchlist.find((e) => e.address === addr);
      return data.txs.map((tx) => ({ ...tx, whaleLabel: whale?.label ?? shortAddr(addr) }));
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  return (
    <AppShell>
      <div className="relative min-h-screen bg-slate-950 text-slate-100">
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-orange-500/6 blur-[100px]" />
        </div>

        <div className="relative z-10">
          <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-6 space-y-6">

            {/* Header */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("sm2_tracking")}</p>
              <div className="flex items-center gap-3 mt-2">
                <h1 className="text-2xl font-bold text-white">{t("sm_title")}</h1>
                {isPremium && (
                  <span className="flex items-center gap-1.5 rounded-full bg-violet-500/20 border border-violet-500/30 px-2.5 py-1 text-[11px] font-bold text-violet-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                    <span title={t("sm2_rt_active")}>RT</span>
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-400">
                {isPremium ? t("sm2_rt_active") : t("sm2_subtitle_off")}
              </p>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-800 w-fit">
              {(["watchlist", "history", "alerts"] as const).map((tabId) => {
                const labels: Record<string, string> = {
                  watchlist: t("sm_watchlist"),
                  history: t("sm_history"),
                  alerts: t("sm_alerts"),
                };
                return (
                  <button
                    key={tabId}
                    type="button"
                    onClick={() => setTab(tabId)}
                    className={`relative px-4 py-2 rounded-lg text-sm font-medium transition ${
                      tab === tabId ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {labels[tabId]}
                    {tabId === "alerts" && isPro && unreadAlerts > 0 && (
                      <span className="absolute -top-1 -right-1 w-4 h-4 bg-orange-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                        {unreadAlerts > 9 ? "9+" : unreadAlerts}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Tab: Watchlist ── */}
            {tab === "watchlist" && (
              <div className="space-y-5">
                {/* Add form */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("sm_add_wallet")}</p>
                  <div className="flex flex-wrap gap-3">
                    <select value={newChain} onChange={(e) => setNewChain(e.target.value as "eth" | "sol" | "btc")}
                      className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
                      <option value="eth">{t("sm2_tab_evm")}</option>
                      <option value="sol">Solana</option>
                      <option value="btc">Bitcoin</option>
                    </select>
                    <input type="text"
                      placeholder={newChain === "eth" ? t("sm2_addr_evm") : newChain === "btc" ? t("sm2_addr_btc") : t("sm2_addr_sol")}
                      value={newAddress} onChange={(e) => setNewAddress(e.target.value)}
                      className="flex-1 min-w-[220px] rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
                    <input type="text" placeholder={t("sm2_name_ph")}
                      value={newLabel} onChange={(e) => setNewLabel(e.target.value)}
                      className="w-48 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
                    <button onClick={handleAdd}
                      className={`${btnPrimary} px-5 py-2 text-sm`}>
                      + {t("add")}
                    </button>
                    <button onClick={() => setShowKnown((v) => !v)}
                      className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-orange-400/40 hover:text-orange-200 transition">
                      {t("sm_known_whales")}
                    </button>
                  </div>
                  {addError && (
                    <p className="text-xs text-rose-400">
                      {addError}{" "}
                      {addErrorIsLimit && (
                        <a href={upgradeHref} className="text-orange-400 underline hover:text-orange-300">{paymentsFrozen ? `🧪 ${t("dash_beta_cta_short")} →` : t("sm2_upgrade")}</a>
                      )}
                    </p>
                  )}
                  {!isPro && watchlist.length >= FREE_WHALE_LIMIT && !addError && (
                    <p className="text-xs text-amber-400/80">
                      ⚠️ {t("sm2_limit_reached")} ({FREE_WHALE_LIMIT}).{" "}
                      <a href={upgradeHref} className="text-orange-400 underline hover:text-orange-300">{paymentsFrozen ? `🧪 ${t("dash_beta_cta_short")} →` : t("sm2_upgrade_pro")}</a>
                    </p>
                  )}
                  {showKnown && (
                    <div className="mt-2 rounded-xl border border-slate-700 bg-slate-800/80 p-4 space-y-2 max-h-80 overflow-y-auto">
                      <p className="text-xs text-slate-400 mb-2">{t("sm2_click_add")}</p>
                      <input type="text" value={knownQuery} onChange={(e) => setKnownQuery(e.target.value)} placeholder={t("sm2_search_whales")}
                        className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500" />
                      {filteredKnown.map((w) => (
                        <button key={w.address} onClick={() => handleAddKnown(w)}
                          disabled={watchlist.some((e) => e.address.toLowerCase() === w.address.toLowerCase())}
                          className="w-full flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-left hover:border-orange-400/40 disabled:opacity-40 disabled:cursor-not-allowed transition">
                          <div>
                            <span className="text-sm font-semibold text-white">{w.label}</span>
                            <span className="ml-2 text-xs text-slate-500 font-mono">{shortAddr(w.address)}</span>
                          </div>
                          <span className="text-xs rounded-full border border-slate-600 px-2 py-0.5 text-slate-400">{w.chain.toUpperCase()}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {watchlist.length === 0 && (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
                    <p className="text-3xl mb-3">🕵️</p>
                    <p className="text-sm font-semibold text-white">{t("sm_watchlist_empty")}</p>
                    <p className="mt-1 text-xs text-slate-400">{t("sm_watchlist_empty_desc")}</p>
                    <p className="mt-4 text-xs text-slate-500">{t("sm2_start_with")}</p>
                    <div className="mt-2 flex flex-wrap justify-center gap-2">
                      {starterWhales.map((w) => (
                        <button key={w.address} type="button" onClick={() => handleAddKnown(w)}
                          className="rounded-full border border-orange-500/40 bg-orange-500/10 px-3 py-1.5 text-xs font-semibold text-orange-300 transition hover:bg-orange-500/20">
                          🐋 {w.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-5">
                  {watchlist.map((entry) => {
                    const data = walletData[entry.address];
                    return (
                      <div key={entry.address} className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-sm font-bold">
                              {entry.label.slice(0, 1).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-white">{entry.label}</p>
                              <p className="text-xs text-slate-500 font-mono">{shortAddr(entry.address)}</p>
                            </div>
                            <span className="ml-2 text-xs rounded-full border border-slate-700 px-2 py-0.5 text-slate-400">{entry.chain.toUpperCase()}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {data && !data.loading && !data.error && (
                              <span className="text-right">
                                <span className="block text-sm font-bold text-emerald-400">{formatUsd(data.totalUsd)}</span>
                                {data.fetchedAt && <span className="block text-[10px] text-slate-500">{t("updated")} {new Date(data.fetchedAt).toLocaleTimeString(uiLocale(), { hour: "2-digit", minute: "2-digit" })}</span>}
                              </span>
                            )}
                            {entry.chain !== "sol" && (
                              <button type="button"
                                onClick={() => { setTab("history"); handleHistorySelect(entry.address); }}
                                className="text-xs text-slate-400 hover:text-orange-300 transition px-2 py-1 rounded-lg hover:bg-slate-800"
                                title={t("sm2_view_history")}>
                                📋
                              </button>
                            )}
                            <button type="button" onClick={() => fetchWalletData(entry)}
                              className="text-xs text-slate-400 hover:text-orange-300 transition px-2 py-1 rounded-lg hover:bg-slate-800" title={t("refresh")}>↻</button>
                            <button type="button" onClick={() => handleRemove(entry.address)}
                              className="text-xs text-slate-500 hover:text-rose-400 transition px-2 py-1 rounded-lg hover:bg-slate-800" title={t("remove")}>✕</button>
                          </div>
                        </div>
                        <div className="px-6 py-4">
                          {!data || data.loading ? (
                            <p className="text-xs text-slate-400 animate-pulse py-4 text-center">{t("loading")}</p>
                          ) : data.error ? (
                            <p className="text-xs text-rose-400 py-2">{data.error}</p>
                          ) : data.tokens.length === 0 ? (
                            <p className="text-xs text-slate-500 py-2">{t("sm2_no_token")}</p>
                          ) : (
                            <div className="space-y-1">
                              {data.tokens.slice(0, 15).map((token) => (
                                <div key={token.address + token.symbol} className="flex items-center justify-between py-1.5 border-b border-slate-800/60 last:border-0">
                                  <div className="flex items-center gap-2.5">
                                    {token.logo ? (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img src={token.logo} alt={token.symbol} className="h-5 w-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                                    ) : (
                                      <div className="h-5 w-5 rounded-full bg-slate-700 flex items-center justify-center text-[9px] text-slate-400">{token.symbol.slice(0, 2)}</div>
                                    )}
                                    <div>
                                      <span className="text-sm font-semibold text-white">{token.symbol}</span>
                                      <span className="ml-2 text-xs text-slate-500">{token.name}</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-semibold text-emerald-400">{formatUsd(token.usdValue)}</p>
                                    {token.usdPrice > 0 && <p className="text-xs text-slate-500">@ {formatUsd(token.usdPrice)}</p>}
                                  </div>
                                </div>
                              ))}
                              {data.tokens.length > 15 && (
                                <p className="text-xs text-slate-500 pt-2 text-center">+ {data.tokens.length - 15} {t("sm2_more_tokens")}</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Tab: Histórico ── */}
            {tab === "history" && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("sm_history")}</p>
                  {ethWatchlist.length === 0 ? (
                    <p className="text-sm text-slate-500">{t("sm2_add_evm_hist")}</p>
                  ) : (
                    <>
                      {/* Wallet selector */}
                      <div className="flex flex-wrap gap-2">
                        <button type="button"
                          onClick={() => setHistoryAddr("")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${historyAddr === "" ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
                          {t("all")} ({ethWatchlist.length})
                        </button>
                        {ethWatchlist.map((e) => (
                          <button key={e.address} type="button"
                            onClick={() => handleHistorySelect(e.address)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${historyAddr === e.address ? "bg-orange-500/20 text-orange-400 border border-orange-500/30" : "bg-slate-800 text-slate-400 hover:text-white"}`}>
                            {e.label}
                          </button>
                        ))}
                        <button type="button"
                          onClick={() => {
                            if (historyAddr) {
                              const entry = watchlist.find((e) => e.address === historyAddr);
                              if (entry) fetchTxData(entry);
                            } else {
                              ethWatchlist.forEach(fetchTxData);
                            }
                          }}
                          className="ml-auto px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-orange-300 bg-slate-800 transition">
                          ↻ {t("refresh")}
                        </button>
                      </div>

                      {/* Transactions */}
                      <div className="space-y-0.5">
                        {historyAddr === "" ? (
                          allTxs.length === 0 ? (
                            Object.values(txData).some((d) => d.loading) ? (
                              <p className="text-xs text-slate-400 animate-pulse py-6 text-center">{t("loading")}</p>
                            ) : (
                              <p className="text-xs text-slate-500 py-6 text-center">{t("sm_no_txs")}</p>
                            )
                          ) : allTxs.map((tx, i) => (
                            <TxRow key={`${tx.hash}-${tx.direction}-${tx.whaleLabel}-${i}`} tx={tx} whaleName={tx.whaleLabel} />
                          ))
                        ) : (
                          !selectedTx || selectedTx.loading ? (
                            <p className="text-xs text-slate-400 animate-pulse py-6 text-center">{t("loading")}</p>
                          ) : selectedTx.error ? (
                            <p className="text-xs text-rose-400 py-4">{selectedTx.error}</p>
                          ) : selectedTx.txs.length === 0 ? (
                            <p className="text-xs text-slate-500 py-6 text-center">{t("sm_no_txs")}</p>
                          ) : selectedTx.txs.map((tx, i) => (
                            <TxRow key={`${tx.hash}-${tx.direction}-${i}`} tx={tx} whaleName={selectedEntry?.label} />
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab: Alertas ── */}
            {tab === "alerts" && !isPro && (
              <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-8 flex flex-col items-center gap-4 text-center">
                <div className="text-4xl">🔒</div>
                <div>
                  <p className="text-base font-bold text-white mb-1">{t("sm2_alerts_pro")}</p>
                  <p className="text-sm text-slate-400">{t("sm2_alerts_pro_desc")}</p>
                </div>
                <a href={upgradeHref} className={`${btnPrimary} px-6 py-2.5 text-sm`}>
                  {paymentsFrozen ? `🧪 ${t("dash_beta_cta_short")} →` : t("sm2_upgrade_pro")}
                </a>
              </div>
            )}
            {tab === "alerts" && isPro && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{t("sm_alerts")}</p>
                      <p className="text-xs text-slate-500 mt-1">{t("sm_alert_threshold")} · {t("sm_big_move")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {ethWatchlist.length > 0 && (
                        <button type="button" disabled={checkingAlerts}
                          onClick={async () => {
                            setCheckingAlerts(true);
                            setLastCheckResult(null);
                            const before = alerts.length;
                            await Promise.all(ethWatchlist.map(fetchTxData));
                            setCheckingAlerts(false);
                            setLastCheckResult(alerts.length > before ? "found" : "none");
                          }}
                          className="text-xs text-orange-300 hover:text-orange-200 transition px-3 py-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 disabled:opacity-50">
                          {checkingAlerts ? t("sm2_checking") : `↻ ${t("sm_check_now")}`}
                        </button>
                      )}
                      {alerts.length > 0 && (
                        <button type="button" onClick={clearAlerts}
                          className="text-xs text-slate-500 hover:text-rose-400 transition px-3 py-1.5 rounded-lg hover:bg-slate-800">
                          {t("sm2_clear_all")}
                        </button>
                      )}
                    </div>
                  </div>

                  {alerts.length === 0 ? (
                    <div className="text-center py-10">
                      <p className="text-2xl mb-2">🔔</p>
                      <p className="text-sm text-slate-400">{t("sm_no_alerts")}</p>
                      <p className="text-xs text-slate-600 mt-1">
                        {t("sm2_alerts_appear")}
                      </p>
                      {ethWatchlist.length === 0 && (
                        <p className="text-xs text-slate-600 mt-3">{t("sm2_add_whale_alert")}</p>
                      )}
                      {lastCheckResult === "none" && !checkingAlerts && (
                        <p className="text-xs text-slate-500 mt-3">{t("sm2_no_moves")}</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-0.5">
                      {alerts.map((alert) => (
                        <div key={alert.id} className="py-0.5">
                          <TxRow tx={alert.tx} whaleName={alert.whale} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* On-chain Analysis — Premium */}
                {isPremium ? (
                  <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-400">{t("sm2_onchain")}</p>
                      <span className="rounded-full bg-violet-500/20 border border-violet-500/30 px-2 py-0.5 text-[10px] text-violet-300 font-bold">Premium</span>
                    </div>
                    <p className="text-xs text-slate-400">{t("sm2_onchain_desc")}</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {["MVRV Ratio", "NVT Signal", "Supply in Profit", "Exchange Outflow"].map(m => (
                        <div key={m} className="rounded-xl border border-violet-500/20 bg-slate-950/40 p-3 text-center">
                          <p className="text-xs text-slate-500">{m}</p>
                          <p className="text-sm text-violet-400 font-bold mt-1 animate-pulse">{t("sm2_soon")}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-5 flex flex-col sm:flex-row items-center gap-4">
                    <div className="text-3xl">🔮</div>
                    <div className="flex-1 text-center sm:text-left">
                      <p className="text-sm font-bold text-white mb-0.5">{t("sm2_onchain_premium")}</p>
                      <p className="text-xs text-slate-400">{t("sm2_onchain_premium_desc")}</p>
                    </div>
                    <a href={upgradeHref} className="shrink-0 rounded-full border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-xs font-bold text-violet-300 hover:bg-violet-500/20 transition">
                      {paymentsFrozen ? `🧪 ${t("dash_beta_cta_short")} →` : t("sm2_see_premium")}
                    </a>
                  </div>
                )}
              </div>
            )}

          </main>
        </div>
      </div>
    </AppShell>
  );
}
