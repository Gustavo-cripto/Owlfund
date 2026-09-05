"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { ACCOUNTS_EVENT, ALL_ACCOUNTS_ID, getActiveAccountId } from "@/lib/portfolios/accounts";
import { pullWalletCloud, pushWalletCloud } from "@/lib/portfolios/cloudSync";
import {
  computeFifo, deleteTrade, loadTrades, parseTradesCsv, restoreTrade, tradeId, tradesToCsv, upsertTrade, writeTradesRaw,
  type Trade, type TradeType,
} from "@/lib/portfolios/trades";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";

// ── Constants ─────────────────────────────────────────────────────────────────

const LOCALE_BY_LANG: Record<string, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };
const OTHER_ASSET = "__other__";
const ALL_FILTER = "__all__";

const ASSET_LIST = [
  { symbol: "BTC",  name: "Bitcoin" },
  { symbol: "ETH",  name: "Ethereum" },
  { symbol: "SOL",  name: "Solana" },
  { symbol: "ADA",  name: "Cardano" },
  { symbol: "BNB",  name: "BNB" },
  { symbol: "XRP",  name: "XRP" },
  { symbol: "DOGE", name: "Dogecoin" },
  { symbol: "DOT",  name: "Polkadot" },
  { symbol: "LINK", name: "Chainlink" },
  { symbol: "AVAX", name: "Avalanche" },
  { symbol: "POL",  name: "Polygon (ex-MATIC)" },
  { symbol: "UNI",  name: "Uniswap" },
  { symbol: "AAVE", name: "Aave" },
  { symbol: "LTC",  name: "Litecoin" },
  { symbol: "ATOM", name: "Cosmos" },
  { symbol: "NEAR", name: "NEAR" },
  { symbol: "FIL",  name: "Filecoin" },
  { symbol: "ICP",  name: "Internet Computer" },
  { symbol: "HYPE", name: "Hyperliquid" },
  { symbol: "SUI",  name: "Sui" },
  { symbol: "APT",  name: "Aptos" },
  { symbol: "ARB",  name: "Arbitrum" },
  { symbol: "OP",   name: "Optimism" },
  { symbol: "TON",  name: "Toncoin" },
  { symbol: "USDT", name: "Tether" },
  { symbol: "USDC", name: "USD Coin" },
  { symbol: "DAI",  name: "DAI" },
];

// Exchanges licenciadas MiCA 🇪🇺 primeiro; Binance a encerrar na UE.
const EXCHANGE_IDS = ["kraken", "coinbase", "okx", "bybit", "cryptocom", "bitpanda", "bitstamp", "binance", "kucoin", "bitfinex", "gateio", "htx", "own", "other"] as const;
const EXCHANGE_LABEL: Record<string, string> = {
  kraken: "Kraken", coinbase: "Coinbase", okx: "OKX", bybit: "Bybit", cryptocom: "Crypto.com", bitpanda: "Bitpanda",
  bitstamp: "Bitstamp", binance: "Binance", kucoin: "KuCoin", bitfinex: "Bitfinex", gateio: "Gate.io", htx: "HTX (Huobi)",
};

const todayIso = () => new Date().toISOString().slice(0, 10);

type FormState = { type: TradeType; asset: string; customAsset: string; quantity: string; priceEur: string; date: string; exchange: string; notes: string };
const emptyForm = (): FormState => ({ type: "compra", asset: "BTC", customAsset: "", quantity: "", priceEur: "", date: todayIso(), exchange: "Kraken", notes: "" });

// ── Component ─────────────────────────────────────────────────────────────────

export default function HistoricoPage() {
  const { isLoading } = useRequireAuth("/login");
  const { t, lang } = useLanguage();
  const { hideBalances, format: fmtCur, formatSigned } = useCurrencyFormat();
  const locale = LOCALE_BY_LANG[lang] ?? "pt-PT";

  const fmtEur = useCallback((v: number) => fmtCur(v), [fmtCur]);
  const fmtQty = useCallback((v: number, sym: string) =>
    hideBalances ? "••••" : v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: sym === "BTC" ? 8 : 6 }), [locale, hideBalances]);
  const fmtDate = useCallback((iso: string, opts?: Intl.DateTimeFormatOptions) =>
    new Date(iso + "T12:00:00").toLocaleDateString(locale, opts), [locale]);
  const exLabel = useCallback((id: string) => {
    if (id === "own") return t("hx_own_wallet");
    if (id === "other") return t("hx_other");
    return EXCHANGE_LABEL[id] ?? id;
  }, [t]);

  // ── state ──
  const [txs, setTxs] = useState<Trade[]>([]);
  const [acctId, setAcctId] = useState<string>("");
  const readOnly = acctId === ALL_ACCOUNTS_ID;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => void } | null>(null);
  const [filterAsset, setFilterAsset] = useState(ALL_FILTER);
  const [filterType, setFilterType] = useState<"todos" | TradeType>("todos");
  const [sortDesc, setSortDesc] = useState(true);
  const [importPreview, setImportPreview] = useState<{ trades: Trade[]; skipped: number; error?: string } | null>(null);
  const [showFifoHelp, setShowFifoHelp] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, undo?: () => void) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6000 : 3000);
  }, []);

  const reload = useCallback(() => {
    const id = getActiveAccountId();
    setAcctId(id);
    setTxs(loadTrades(id));
  }, []);

  useEffect(() => {
    // Puxa da nuvem primeiro (merge por id) e só depois lê.
    pullWalletCloud().catch(() => false).then(reload);
    // Troca de conta no seletor → recarregar (senão gravava-se na conta errada).
    const onAcct = () => { setEditId(null); setForm(emptyForm()); reload(); };
    window.addEventListener(ACCOUNTS_EVENT, onAcct);
    return () => window.removeEventListener(ACCOUNTS_EVENT, onAcct);
  }, [reload]);

  // ── computed ──
  const formTotal = useMemo(() => (parseFloat(form.quantity) || 0) * (parseFloat(form.priceEur) || 0), [form.quantity, form.priceEur]);

  const filtered = useMemo(() => {
    return txs
      .filter((x) => filterAsset === ALL_FILTER || x.asset === filterAsset)
      .filter((x) => filterType === "todos" || x.type === filterType)
      .sort((a, b) => {
        const d = a.date === b.date ? (a.updatedAt ?? 0) - (b.updatedAt ?? 0) : (a.date < b.date ? -1 : 1);
        return sortDesc ? -d : d;
      });
  }, [txs, filterAsset, filterType, sortDesc]);

  const fifo = useMemo(() => computeFifo(txs), [txs]);
  const summary = useMemo(() => {
    const invested = txs.filter((x) => x.type === "compra").reduce((s, x) => s + x.totalEur, 0);
    const sold = txs.filter((x) => x.type === "venda").reduce((s, x) => s + x.totalEur, 0);
    return { invested, sold, realizedPnl: fifo.realizedPnl, txCount: txs.length, assets: Object.keys(fifo.byAsset).length };
  }, [txs, fifo]);
  const unmatchedList = useMemo(() => Object.entries(fifo.unmatched).filter(([, q]) => q > 0), [fifo]);
  const assetOptions = useMemo(() => Array.from(new Set(txs.map((x) => x.asset))).sort(), [txs]);

  // ── handlers ──
  const resolveAsset = () => {
    if (form.asset === OTHER_ASSET) {
      const sym = form.customAsset.toUpperCase().replace(/[^A-Z0-9.]/g, "").slice(0, 12);
      return sym ? { symbol: sym, name: sym } : null;
    }
    return ASSET_LIST.find((a) => a.symbol === form.asset) ?? { symbol: form.asset, name: form.asset };
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setFormError(null);
    if (readOnly) { setFormError(t("hx_readonly_all")); return; }
    const qty = parseFloat(form.quantity);
    const price = parseFloat(form.priceEur);
    if (!Number.isFinite(qty) || qty <= 0) { setFormError(t("hx_qty_invalid")); return; }
    if (!Number.isFinite(price) || price < 0) { setFormError(t("hx_price_invalid")); return; }
    if (!form.date) { setFormError(t("hx_date_required")); return; }
    if (form.date > todayIso()) { setFormError(t("hx_date_future")); return; }
    const assetInfo = resolveAsset();
    if (!assetInfo) { setFormError(t("hx_asset_required")); return; }
    if (!editId) {
      const dup = txs.find((x) => x.asset === assetInfo.symbol && x.date === form.date && x.type === form.type && x.quantity === qty && x.priceEur === price);
      if (dup && !window.confirm(t("hx_dup_confirm"))) return;
    }
    const tx: Trade = {
      id: editId ?? tradeId(),
      type: form.type,
      asset: assetInfo.symbol,
      assetName: assetInfo.name,
      quantity: qty,
      priceEur: price,
      totalEur: qty * price,
      date: form.date,
      exchange: form.exchange,
      notes: form.notes.trim().slice(0, 200),
    };
    setTxs(upsertTrade(tx));
    pushWalletCloud();
    const wasEdit = !!editId;
    setEditId(null);
    setForm((f) => ({ ...emptyForm(), asset: f.asset === OTHER_ASSET ? "BTC" : f.asset, exchange: f.exchange }));
    setFlashId(tx.id);
    setTimeout(() => setFlashId(null), 2500);
    showToast(wasEdit ? t("hx_saved_edit") : t("hx_saved_new"));
    if (!wasEdit) qtyRef.current?.focus();
    else tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleEdit = (tx: Trade) => {
    if (readOnly) return;
    setEditId(tx.id);
    const known = ASSET_LIST.some((a) => a.symbol === tx.asset);
    setForm({
      type: tx.type,
      asset: known ? tx.asset : OTHER_ASSET,
      customAsset: known ? "" : tx.asset,
      quantity: String(tx.quantity),
      priceEur: String(tx.priceEur),
      date: tx.date,
      exchange: tx.exchange,
      notes: tx.notes,
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleDelete = (tx: Trade) => {
    if (readOnly) return;
    setTxs(deleteTrade(tx.id));
    pushWalletCloud();
    if (editId === tx.id) { setEditId(null); setForm(emptyForm()); }
    showToast(t("hx_deleted"), () => {
      setTxs(restoreTrade(tx));
      pushWalletCloud();
      setToast(null);
    });
  };

  const cancelEdit = () => { setEditId(null); setForm(emptyForm()); setFormError(null); };

  const prefillMissingBuy = (asset: string, qty: number) => {
    const known = ASSET_LIST.find((a) => a.symbol === asset);
    setEditId(null);
    setForm({ ...emptyForm(), type: "compra", asset: known ? asset : OTHER_ASSET, customAsset: known ? "" : asset, quantity: String(qty), date: "" });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const exportCsv = () => {
    const csv = tradesToCsv(txs);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `chainfolio-historico-${todayIso()}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const onImportFile = async (file: File) => {
    const text = await file.text();
    setImportPreview(parseTradesCsv(text));
  };

  const confirmImport = () => {
    if (!importPreview || readOnly) return;
    const now = Date.now();
    const incoming = importPreview.trades.map((x) => ({ ...x, updatedAt: now }));
    // Ignora duplicados exatos já existentes (mesmo ativo/data/tipo/qty/preço).
    const key = (x: Trade) => `${x.asset}|${x.date}|${x.type}|${x.quantity}|${x.priceEur}`;
    const existing = new Set(txs.map(key));
    const fresh = incoming.filter((x) => !existing.has(key(x)));
    const all = [...fresh, ...txs];
    writeTradesRaw(all);
    setTxs(loadTrades());
    pushWalletCloud();
    setImportPreview(null);
    showToast(t("hx_import_done").replace("{n}", String(fresh.length)).replace("{d}", String(incoming.length - fresh.length)));
  };

  if (isLoading) return null;

  const typeLabel = (ty: TradeType) => (ty === "compra" ? `▲ ${t("hx_buy_one")}` : `▼ ${t("hx_sell_one")}`);
  const isEmpty = txs.length === 0;

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">

          {/* ── Header ── */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("hx_eyebrow")}</p>
              <h1 className="text-2xl font-black text-white mt-0.5">{t("hx_title")}</h1>
              <p className="text-sm text-slate-400 mt-1">
                {t("hx_subtitle")}{" "}
                <button type="button" onClick={() => setShowFifoHelp((v) => !v)} className="text-orange-300 underline decoration-dotted">{t("hx_fifo_what")}</button>
              </p>
            </div>
            {!isEmpty && (
              <div className="flex gap-2">
                <button type="button" onClick={exportCsv} className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-orange-400/40 hover:text-orange-200 transition">
                  ↓ {t("hx_export_csv")}
                </button>
                {!readOnly && (
                  <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-orange-400/40 hover:text-orange-200 transition">
                    ↑ {t("hx_import_csv")}
                  </button>
                )}
              </div>
            )}
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImportFile(f); e.target.value = ""; }} />
          </div>

          {showFifoHelp && (
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4 text-xs text-slate-300 space-y-1">
              <p className="font-semibold text-orange-200">{t("hx_fifo_title")}</p>
              <p>{t("hx_fifo_p1")}</p>
              <p>{t("hx_fifo_p2")}</p>
              <p className="text-slate-500">{t("hx_fifo_p3")}</p>
            </div>
          )}

          {readOnly && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/[0.06] px-4 py-3 text-xs text-sky-200">
              👁 {t("hx_readonly_all")}
            </div>
          )}

          {/* ── Empty state (before the form) ── */}
          {isEmpty && !readOnly && (
            <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center">
              <p className="text-3xl mb-2">📋</p>
              <p className="text-sm font-semibold text-white">{t("hx_no_tx")}</p>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">{t("hx_no_tx_desc")}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => { setForm((f) => ({ ...f, type: "compra" })); qtyRef.current?.focus(); formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                  className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400 transition">
                  ▲ {t("hx_first_buy")}
                </button>
                <button type="button" onClick={() => fileRef.current?.click()} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition">
                  ↑ {t("hx_import_csv")}
                </button>
              </div>
            </div>
          )}

          {/* ── Summary cards ── */}
          {!isEmpty && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: t("hx_total_invested"), value: fmtEur(summary.invested), color: "text-white" },
                { label: t("hx_total_sold"), value: fmtEur(summary.sold), color: "text-white" },
                { label: t("hx_pl_realized"), value: formatSigned(summary.realizedPnl), color: summary.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400" },
                { label: t("hx_transactions"), value: `${summary.txCount} (${summary.assets} ${t("hx_assets_word")})`, color: "text-slate-300" },
              ].map((m) => (
                <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{m.label}</p>
                  <p className={`mt-1 text-base font-bold ${m.color}`}>{m.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* ── Unmatched sells warning ── */}
          {unmatchedList.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-xs text-amber-200">
              <p className="font-semibold">⚠️ {t("hx_unmatched_title")}</p>
              <p className="mt-1 text-amber-200/80">{t("hx_unmatched_desc")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {unmatchedList.map(([asset, q]) => (
                  <button key={asset} type="button" disabled={readOnly} onClick={() => prefillMissingBuy(asset, q)}
                    className="rounded-full border border-amber-400/40 px-3 py-1 font-semibold text-amber-100 hover:bg-amber-500/10 transition disabled:opacity-50">
                    {fmtQty(q, asset)} {asset} → {t("hx_add_missing_buy")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Add / Edit form ── */}
          {!readOnly && (
          <form ref={formRef} onSubmit={handleSubmit} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 scroll-mt-20">
            <h2 className="text-sm font-bold text-white mb-4">
              {editId ? `✏️ ${t("hx_edit_tx")}` : `➕ ${t("hx_new_tx")}`}
            </h2>

            {/* Type toggle */}
            <div className="flex gap-2 mb-5" role="radiogroup" aria-label={t("hx_col_type")}>
              {(["compra", "venda"] as TradeType[]).map((ty) => (
                <button
                  key={ty}
                  type="button"
                  role="radio"
                  aria-checked={form.type === ty}
                  onClick={() => setForm((f) => ({ ...f, type: ty }))}
                  className={`flex-1 rounded-xl py-2 text-sm font-bold transition ${
                    form.type === ty
                      ? ty === "compra"
                        ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300"
                        : "bg-rose-500/20 border border-rose-500/50 text-rose-300"
                      : "bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  {typeLabel(ty)}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* Asset */}
              <div>
                <label htmlFor="hx-asset" className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_asset")}</label>
                <select
                  id="hx-asset"
                  value={form.asset}
                  onChange={(e) => setForm((f) => ({ ...f, asset: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-400"
                >
                  {ASSET_LIST.map((a) => (
                    <option key={a.symbol} value={a.symbol}>{a.symbol} — {a.name}</option>
                  ))}
                  <option value={OTHER_ASSET}>{t("hx_other_asset")}</option>
                </select>
                {form.asset === OTHER_ASSET && (
                  <input
                    type="text"
                    autoFocus
                    placeholder={t("hx_other_asset_ph")}
                    value={form.customAsset}
                    maxLength={12}
                    onChange={(e) => setForm((f) => ({ ...f, customAsset: e.target.value.toUpperCase() }))}
                    className="mt-2 w-full rounded-xl border border-orange-500/40 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-400"
                  />
                )}
              </div>

              {/* Quantity */}
              <div>
                <label htmlFor="hx-qty" className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_quantity")}</label>
                <input
                  id="hx-qty"
                  ref={qtyRef}
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-400"
                />
              </div>

              {/* Price */}
              <div>
                <label htmlFor="hx-price" className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_unit_price")}</label>
                <input
                  id="hx-price"
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="0.00"
                  value={form.priceEur}
                  onChange={(e) => setForm((f) => ({ ...f, priceEur: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-400"
                />
              </div>

              {/* Date */}
              <div>
                <label htmlFor="hx-date" className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_date")}</label>
                <input
                  id="hx-date"
                  type="date"
                  max={todayIso()}
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-400"
                />
              </div>

              {/* Exchange */}
              <div>
                <label htmlFor="hx-ex" className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_exchange_src")}</label>
                <select
                  id="hx-ex"
                  value={form.exchange}
                  onChange={(e) => setForm((f) => ({ ...f, exchange: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-400"
                >
                  {EXCHANGE_IDS.map((ex) => {
                    const label = exLabel(ex);
                    return <option key={ex} value={label}>{label}</option>;
                  })}
                  {form.exchange && !EXCHANGE_IDS.some((ex) => exLabel(ex) === form.exchange) && (
                    <option value={form.exchange}>{form.exchange}</option>
                  )}
                </select>
              </div>

              {/* Total (read-only) */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_total")}</label>
                <div className="flex items-center rounded-xl border border-slate-700 bg-slate-950/30 px-3 py-2 text-sm">
                  <span className={`font-bold ${form.type === "compra" ? "text-emerald-400" : "text-rose-400"}`}>
                    {form.type === "compra" ? "−" : "+"} {fmtCur(formTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="mt-3">
              <label htmlFor="hx-notes" className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_notes")}</label>
              <input
                id="hx-notes"
                type="text"
                maxLength={200}
                placeholder={t("hx_notes_ph")}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-400"
              />
            </div>

            {formError && <p className="mt-2 text-xs text-rose-300" role="alert">{formError}</p>}

            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                className={`rounded-xl px-6 py-2 text-sm font-bold transition ${
                  form.type === "compra"
                    ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30"
                    : "bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30"
                }`}
              >
                {editId ? t("hx_save") : form.type === "compra" ? t("hx_reg_buy") : t("hx_reg_sell")}
              </button>
              {editId && (
                <button type="button" onClick={cancelEdit} className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:text-white transition">
                  {t("cancel")}
                </button>
              )}
              <span className="ml-auto self-center text-[10px] text-slate-600">{t("hx_enter_hint")}</span>
            </div>
          </form>
          )}

          {/* ── Filters + Table ── */}
          {!isEmpty && (
            <div ref={tableRef} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 scroll-mt-20">
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <h2 className="text-sm font-bold text-white mr-auto">{t("hx_transactions")} ({filtered.length})</h2>

                <select
                  aria-label={t("hx_asset")}
                  value={filterAsset}
                  onChange={(e) => setFilterAsset(e.target.value)}
                  className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 outline-none"
                >
                  <option value={ALL_FILTER}>{t("hx_all")}</option>
                  {assetOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>

                <select
                  aria-label={t("hx_col_type")}
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as typeof filterType)}
                  className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 outline-none"
                >
                  <option value="todos">{t("hx_all_types")}</option>
                  <option value="compra">{t("hx_buys")}</option>
                  <option value="venda">{t("hx_sells")}</option>
                </select>

                <button
                  type="button"
                  onClick={() => setSortDesc((v) => !v)}
                  className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 hover:text-white transition"
                >
                  {sortDesc ? `↓ ${t("hx_sort_newest")}` : `↑ ${t("hx_sort_oldest")}`}
                </button>
              </div>

              {/* Desktop table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                      <th className="pb-2 text-left">{t("hx_date")}</th>
                      <th className="pb-2 text-left">{t("hx_col_type")}</th>
                      <th className="pb-2 text-left">{t("hx_asset")}</th>
                      <th className="pb-2 text-right">{t("hx_quantity")}</th>
                      <th className="pb-2 text-right">{t("hx_col_unit")}</th>
                      <th className="pb-2 text-right">{t("hx_col_total")}</th>
                      <th className="pb-2 text-left">{t("hx_col_exchange")}</th>
                      <th className="pb-2 text-left">{t("hx_col_notes")}</th>
                      <th className="pb-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filtered.map((tx) => (
                      <tr key={tx.id} className={`transition group ${flashId === tx.id ? "bg-orange-500/10" : "hover:bg-slate-800/30"}`}>
                        <td className="py-2.5 pr-3 text-slate-400 tabular-nums whitespace-nowrap">
                          {fmtDate(tx.date, { day: "2-digit", month: "short", year: "2-digit" })}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`rounded-full px-2 py-0.5 font-semibold text-[10px] ${tx.type === "compra" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                            {typeLabel(tx.type)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="font-bold text-white">{tx.asset}</span>
                          {tx.assetName && tx.assetName !== tx.asset && <span className="ml-1 text-slate-500">{tx.assetName}</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-slate-200">{fmtQty(tx.quantity, tx.asset)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-slate-400">{fmtEur(tx.priceEur)}</td>
                        <td className={`py-2.5 pr-3 text-right tabular-nums font-semibold ${tx.type === "compra" ? "text-white" : "text-emerald-300"}`}>
                          {tx.type === "venda" && !hideBalances ? "+" : ""}{fmtEur(tx.totalEur)}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-500">{tx.exchange}</td>
                        <td className="py-2.5 pr-3 text-slate-600 max-w-[120px] truncate" title={tx.notes || undefined}>{tx.notes || "—"}</td>
                        <td className="py-2.5">
                          {!readOnly && (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                              <button type="button" onClick={() => handleEdit(tx)} aria-label={t("hx_edit_tx")} title={t("hx_edit_tx")}
                                className="rounded px-2 py-1 text-[10px] text-slate-400 hover:text-white hover:bg-slate-700 transition">✏️</button>
                              <button type="button" onClick={() => handleDelete(tx)} aria-label={t("hx_delete")} title={t("hx_delete")}
                                className="rounded px-2 py-1 text-[10px] text-rose-400 hover:text-white hover:bg-rose-500/20 transition">✕</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {filtered.map((tx) => (
                  <div key={tx.id} className={`rounded-xl border p-3 ${flashId === tx.id ? "border-orange-500/50 bg-orange-500/10" : "border-slate-800 bg-slate-950/40"}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tx.type === "compra" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                          {typeLabel(tx.type)}
                        </span>
                        <span className="font-bold text-white text-sm">{tx.asset}</span>
                      </div>
                      {!readOnly && (
                        <div className="flex gap-1">
                          <button type="button" onClick={() => handleEdit(tx)} aria-label={t("hx_edit_tx")} className="text-slate-500 hover:text-white text-xs px-1">✏️</button>
                          <button type="button" onClick={() => handleDelete(tx)} aria-label={t("hx_delete")} className="text-rose-500 hover:text-white text-xs px-1">✕</button>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-400">
                      <span>{fmtQty(tx.quantity, tx.asset)} {tx.asset}</span>
                      <span className="text-right">{fmtEur(tx.priceEur)} {t("hx_per_unit")}</span>
                      <span className="text-slate-500">{fmtDate(tx.date)}</span>
                      <span className={`text-right font-semibold ${tx.type === "compra" ? "text-white" : "text-emerald-300"}`}>
                        {tx.type === "venda" && !hideBalances ? "+" : ""}{fmtEur(tx.totalEur)}
                      </span>
                    </div>
                    {tx.notes && <p className="mt-1.5 text-[10px] text-slate-600 italic">{tx.notes}</p>}
                  </div>
                ))}
              </div>

              {filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-500">{t("hx_no_filtered")}</p>
              )}
            </div>
          )}

          {/* ── Cumulative realized PNL ── */}
          {fifo.cumulative.length >= 2 && !hideBalances && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <h2 className="text-sm font-bold text-white mb-1">{t("hx_pnl_chart_title")}</h2>
              <p className="text-[11px] text-slate-500 mb-3">{t("hx_pnl_chart_hint")}</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={fifo.cumulative.map((c, i) => ({ i, date: c.date, pnl: Math.round(c.pnl * 100) / 100 }))} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="hxPnl" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={fifo.realizedPnl >= 0 ? "#34d399" : "#fb7185"} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={fifo.realizedPnl >= 0 ? "#34d399" : "#fb7185"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(d: string) => fmtDate(d, { month: "short", year: "2-digit" })} minTickGap={24} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(v: number) => fmtCur(v, { compact: true })} width={64} axisLine={false} tickLine={false} />
                    <ReferenceLine y={0} stroke="#334155" />
                    <Tooltip
                      contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, fontSize: 12 }}
                      labelFormatter={(d) => fmtDate(String(d))}
                      formatter={(v) => [formatSigned(Number(v)), t("hx_pl_realized")]}
                    />
                    <Area type="monotone" dataKey="pnl" stroke={fifo.realizedPnl >= 0 ? "#34d399" : "#fb7185"} strokeWidth={2} fill="url(#hxPnl)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ── Per-asset breakdown ── */}
          {!isEmpty && (() => {
            const rows = Object.entries(fifo.byAsset).sort((a, b) => b[1].buys - a[1].buys);
            if (rows.length === 0) return null;
            return (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <h2 className="text-sm font-bold text-white mb-1">{t("hx_summary_asset")}</h2>
                <p className="text-[11px] text-slate-500 mb-4">{t("hx_summary_asset_hint")}</p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map(([sym, data]) => {
                    const negative = data.qtyNet < -1e-9;
                    return (
                      <div key={sym} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-bold text-white text-sm">{sym}</p>
                            <p className="text-[10px] text-slate-500">{data.name}</p>
                          </div>
                          <span className={`text-xs font-semibold ${negative ? "text-amber-400" : data.qtyNet > 1e-9 ? "text-emerald-400" : "text-slate-500"}`} title={negative ? t("hx_unmatched_title") : undefined}>
                            {negative ? "⚠️ " : ""}{fmtQty(data.qtyNet, sym)} {sym}
                          </span>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-1 text-xs">
                          <div>
                            <p className="text-[10px] text-slate-500">{t("hx_buys")}</p>
                            <p className="text-white font-medium">{fmtEur(data.buys)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-[10px] text-slate-500">{t("hx_sells")}</p>
                            <p className={data.sells > 0 ? "text-emerald-300 font-medium" : "text-slate-500"}>{data.sells > 0 ? fmtEur(data.sells) : "—"}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-slate-500">{t("hx_pnl_short")}</p>
                            <p className={`font-medium ${data.sells === 0 ? "text-slate-500" : data.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {data.sells === 0 ? "—" : formatSigned(data.realizedPnl)}
                            </p>
                          </div>
                        </div>
                        {data.qtyNet > 1e-9 && data.costOpen > 0 && (
                          <p className="mt-2 text-[10px] text-slate-500">
                            {t("hx_avg_cost")}: <span className="text-slate-300">{fmtEur(data.costOpen / data.qtyNet)}</span> · {t("hx_open_cost")}: <span className="text-slate-300">{fmtEur(data.costOpen)}</span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-4 text-[11px] text-slate-500">
                  💡 {t("hx_tax_link_hint")} <a href="/fiscalidade" className="text-orange-300 underline decoration-dotted">{t("nav_fiscalidade")} →</a>
                </p>
              </div>
            );
          })()}

        </main>

        {/* ── Import preview modal ── */}
        {importPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 p-6 max-h-[85vh] overflow-y-auto">
              <h3 className="text-sm font-bold text-white">{t("hx_import_title")}</h3>
              {importPreview.error ? (
                <p className="mt-3 text-xs text-rose-300">{importPreview.error === "columns" ? t("hx_import_err_cols") : t("hx_import_err_empty")}</p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-slate-400">
                    {t("hx_import_found").replace("{n}", String(importPreview.trades.length))}
                    {importPreview.skipped > 0 && <> · <span className="text-amber-300">{t("hx_import_skipped").replace("{n}", String(importPreview.skipped))}</span></>}
                  </p>
                  <div className="mt-3 max-h-64 overflow-auto rounded-xl border border-slate-800">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-slate-900 text-[10px] uppercase text-slate-500">
                        <tr><th className="p-2 text-left">{t("hx_date")}</th><th className="p-2 text-left">{t("hx_col_type")}</th><th className="p-2 text-left">{t("hx_asset")}</th><th className="p-2 text-right">{t("hx_quantity")}</th><th className="p-2 text-right">{t("hx_col_unit")}</th><th className="p-2 text-left">{t("hx_col_exchange")}</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {importPreview.trades.slice(0, 50).map((x) => (
                          <tr key={x.id}>
                            <td className="p-2 text-slate-400">{x.date}</td>
                            <td className={`p-2 ${x.type === "compra" ? "text-emerald-400" : "text-rose-400"}`}>{typeLabel(x.type)}</td>
                            <td className="p-2 font-semibold text-white">{x.asset}</td>
                            <td className="p-2 text-right tabular-nums">{x.quantity}</td>
                            <td className="p-2 text-right tabular-nums">{x.priceEur}</td>
                            <td className="p-2 text-slate-500">{x.exchange || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importPreview.trades.length > 50 && <p className="p-2 text-center text-[10px] text-slate-500">+{importPreview.trades.length - 50}…</p>}
                  </div>
                  <p className="mt-2 text-[10px] text-slate-500">{t("hx_import_hint")}</p>
                </>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setImportPreview(null)} className="rounded-xl border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:text-white">{t("cancel")}</button>
                {!importPreview.error && importPreview.trades.length > 0 && (
                  <button type="button" onClick={confirmImport} className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400">
                    ↑ {t("hx_import_confirm").replace("{n}", String(importPreview.trades.length))}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Toast ── */}
        {toast && (
          <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-xs text-slate-100 shadow-xl flex items-center gap-3" role="status">
            <span>{toast.text}</span>
            {toast.undo && (
              <button type="button" onClick={toast.undo} className="font-bold text-orange-300 underline">{t("hx_undo")}</button>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
