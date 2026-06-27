"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// ── Types ─────────────────────────────────────────────────────────────────────

type TxType = "compra" | "venda";

type Transaction = {
  id: string;
  type: TxType;
  asset: string;          // symbol, e.g. "BTC"
  assetName: string;      // full name, e.g. "Bitcoin"
  quantity: number;
  priceEur: number;       // price per unit in EUR
  totalEur: number;       // quantity × priceEur
  date: string;           // ISO date "YYYY-MM-DD"
  exchange: string;
  notes: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "trade-history-v1";

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
  { symbol: "MATIC","name": "Polygon" },
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
  { symbol: "USDT", name: "Tether" },
  { symbol: "USDC", name: "USD Coin" },
  { symbol: "DAI",  name: "DAI" },
];

const EXCHANGES = [
  "Binance", "Coinbase", "Kraken", "Bybit", "KuCoin",
  "OKX", "Bitfinex", "Bitstamp", "Gate.io", "Huobi",
  "Carteira própria", "Outro",
];

const fmtEur = (v: number) =>
  v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtQty = (v: number, sym: string) =>
  sym === "BTC"
    ? v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 8 })
    : v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 6 });

// ── Storage helpers ───────────────────────────────────────────────────────────

const loadTxs = (): Transaction[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Transaction[]) : [];
  } catch { return []; }
};

const saveTxs = (txs: Transaction[]) => {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(txs)); } catch {}
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function HistoricoPage() {
  const { isLoading } = useRequireAuth("/login");
  const { t } = useLanguage();

  // transactions state
  const [txs, setTxs] = useState<Transaction[]>([]);

  useEffect(() => {
    setTxs(loadTxs());
  }, []);

  const persist = useCallback((next: Transaction[]) => {
    setTxs(next);
    saveTxs(next);
  }, []);

  // ── form state ──
  const [form, setForm] = useState({
    type: "compra" as TxType,
    asset: "BTC",
    quantity: "",
    priceEur: "",
    date: new Date().toISOString().slice(0, 10),
    exchange: "Binance",
    notes: "",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);

  // ── filters ──
  const [filterAsset, setFilterAsset] = useState("Todos");
  const [filterType, setFilterType] = useState<"todos" | TxType>("todos");
  const [sortDesc, setSortDesc] = useState(true);

  // ── computed total for form ──
  const formTotal = useMemo(() => {
    const q = parseFloat(form.quantity) || 0;
    const p = parseFloat(form.priceEur) || 0;
    return q * p;
  }, [form.quantity, form.priceEur]);

  // ── filtered + sorted transactions ──
  const filtered = useMemo(() => {
    return txs
      .filter((t) => filterAsset === "Todos" || t.asset === filterAsset)
      .filter((t) => filterType === "todos" || t.type === filterType)
      .sort((a, b) => {
        const d = new Date(a.date).getTime() - new Date(b.date).getTime();
        return sortDesc ? -d : d;
      });
  }, [txs, filterAsset, filterType, sortDesc]);

  // ── summary metrics ──
  const summary = useMemo(() => {
    const invested = txs.filter((t) => t.type === "compra").reduce((s, t) => s + t.totalEur, 0);
    const sold = txs.filter((t) => t.type === "venda").reduce((s, t) => s + t.totalEur, 0);
    // P&L realizado simples: vendas - custo médio das vendas
    // Group by asset for FIFO-style realized P&L
    const byAsset: Record<string, { buys: { qty: number; price: number }[]; realizedPnl: number }> = {};
    [...txs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).forEach((t) => {
      if (!byAsset[t.asset]) byAsset[t.asset] = { buys: [], realizedPnl: 0 };
      if (t.type === "compra") {
        byAsset[t.asset].buys.push({ qty: t.quantity, price: t.priceEur });
      } else {
        // FIFO
        let remaining = t.quantity;
        while (remaining > 0 && byAsset[t.asset].buys.length > 0) {
          const oldest = byAsset[t.asset].buys[0];
          const used = Math.min(remaining, oldest.qty);
          byAsset[t.asset].realizedPnl += used * (t.priceEur - oldest.price);
          oldest.qty -= used;
          remaining -= used;
          if (oldest.qty <= 0) byAsset[t.asset].buys.shift();
        }
      }
    });
    const realizedPnl = Object.values(byAsset).reduce((s, v) => s + v.realizedPnl, 0);
    const txCount = txs.length;
    const assets = new Set(txs.map((t) => t.asset)).size;
    return { invested, sold, realizedPnl, txCount, assets };
  }, [txs]);

  // ── asset filter options ──
  const assetOptions = useMemo(() => {
    const used = Array.from(new Set(txs.map((t) => t.asset)));
    return ["Todos", ...used];
  }, [txs]);

  // ── handlers ──
  const handleSubmit = () => {
    setFormError(null);
    const qty = parseFloat(form.quantity);
    const price = parseFloat(form.priceEur);
    if (!qty || qty <= 0) { setFormError(t("hx_qty_invalid")); return; }
    if (!price || price <= 0) { setFormError(t("hx_price_invalid")); return; }
    if (!form.date) { setFormError(t("hx_date_required")); return; }
    const assetInfo = ASSET_LIST.find((a) => a.symbol === form.asset) ?? { symbol: form.asset, name: form.asset };
    const tx: Transaction = {
      id: editId ?? crypto.randomUUID(),
      type: form.type,
      asset: assetInfo.symbol,
      assetName: assetInfo.name,
      quantity: qty,
      priceEur: price,
      totalEur: qty * price,
      date: form.date,
      exchange: form.exchange,
      notes: form.notes.trim(),
    };
    if (editId) {
      persist(txs.map((t) => (t.id === editId ? tx : t)));
      setEditId(null);
    } else {
      persist([tx, ...txs]);
    }
    setForm({ type: "compra", asset: "BTC", quantity: "", priceEur: "", date: new Date().toISOString().slice(0, 10), exchange: "Binance", notes: "" });
  };

  const handleEdit = (tx: Transaction) => {
    setEditId(tx.id);
    setForm({
      type: tx.type,
      asset: tx.asset,
      quantity: String(tx.quantity),
      priceEur: String(tx.priceEur),
      date: tx.date,
      exchange: tx.exchange,
      notes: tx.notes,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = (id: string) => {
    if (!confirm(t("hx_delete_confirm"))) return;
    persist(txs.filter((t) => t.id !== id));
    if (editId === id) {
      setEditId(null);
      setForm({ type: "compra", asset: "BTC", quantity: "", priceEur: "", date: new Date().toISOString().slice(0, 10), exchange: "Binance", notes: "" });
    }
  };

  if (isLoading) return null;

  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">

          {/* ── Header ── */}
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{t("hx_eyebrow")}</p>
            <h1 className="text-2xl font-black text-white mt-0.5">{t("hx_title")}</h1>
            <p className="text-sm text-slate-400 mt-1">{t("hx_subtitle")}</p>
          </div>

          {/* ── Summary cards ── */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: t("hx_total_invested"), value: `€ ${fmtEur(summary.invested)}`, color: "text-white" },
              { label: t("hx_total_sold"), value: `€ ${fmtEur(summary.sold)}`, color: "text-white" },
              { label: t("hx_pl_realized"), value: `${summary.realizedPnl >= 0 ? "+" : ""}€ ${fmtEur(summary.realizedPnl)}`, color: summary.realizedPnl >= 0 ? "text-emerald-400" : "text-rose-400" },
              { label: t("hx_transactions"), value: `${summary.txCount} (${summary.assets} ${t("hx_assets_word")})`, color: "text-slate-300" },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">{m.label}</p>
                <p className={`mt-1 text-base font-bold ${m.color}`}>{m.value}</p>
              </div>
            ))}
          </div>

          {/* ── Add / Edit form ── */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-sm font-bold text-white mb-4">
              {editId ? "✏️ Editar transação" : "➕ Nova transação"}
            </h2>

            {/* Type toggle */}
            <div className="flex gap-2 mb-5">
              {(["compra", "venda"] as TxType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                  className={`flex-1 rounded-xl py-2 text-sm font-bold transition ${
                    form.type === t
                      ? t === "compra"
                        ? "bg-emerald-500/20 border border-emerald-500/50 text-emerald-300"
                        : "bg-rose-500/20 border border-rose-500/50 text-rose-300"
                      : "bg-slate-800/60 border border-slate-700 text-slate-400 hover:text-white"
                  }`}
                >
                  {t === "compra" ? "▲ Compra" : "▼ Venda"}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {/* Asset */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_asset")}</label>
                <select
                  value={form.asset}
                  onChange={(e) => setForm((f) => ({ ...f, asset: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-400"
                >
                  {ASSET_LIST.map((a) => (
                    <option key={a.symbol} value={a.symbol}>{a.symbol} — {a.name}</option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_quantity")}</label>
                <input
                  type="number"
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
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_unit_price")}</label>
                <input
                  type="number"
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
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_date")}</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-400"
                />
              </div>

              {/* Exchange */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_exchange_src")}</label>
                <select
                  value={form.exchange}
                  onChange={(e) => setForm((f) => ({ ...f, exchange: e.target.value }))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-400"
                >
                  {EXCHANGES.map((ex) => (
                    <option key={ex} value={ex}>{ex}</option>
                  ))}
                </select>
              </div>

              {/* Total (read-only) */}
              <div>
                <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_total")}</label>
                <div className="flex items-center rounded-xl border border-slate-700 bg-slate-950/30 px-3 py-2 text-sm">
                  <span className={`font-bold ${form.type === "compra" ? "text-emerald-400" : "text-rose-400"}`}>
                    {form.type === "compra" ? "-" : "+"}€ {fmtEur(formTotal)}
                  </span>
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="mt-3">
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 mb-1">{t("hx_notes")}</label>
              <input
                type="text"
                placeholder={t("hx_notes_ph")}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 outline-none focus:border-orange-400"
              />
            </div>

            {formError && <p className="mt-2 text-xs text-rose-300">{formError}</p>}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleSubmit}
                className={`rounded-xl px-6 py-2 text-sm font-bold transition ${
                  form.type === "compra"
                    ? "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30"
                    : "bg-rose-500/20 border border-rose-500/40 text-rose-300 hover:bg-rose-500/30"
                }`}
              >
                {editId ? t("hx_save") : form.type === "compra" ? t("hx_reg_buy") : t("hx_reg_sell")}
              </button>
              {editId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditId(null);
                    setForm({ type: "compra", asset: "BTC", quantity: "", priceEur: "", date: new Date().toISOString().slice(0, 10), exchange: "Binance", notes: "" });
                  }}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-400 hover:text-white transition"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>

          {/* ── Filters + Table ── */}
          {txs.length > 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <h2 className="text-sm font-bold text-white mr-auto">Transações ({filtered.length})</h2>

                {/* Asset filter */}
                <select
                  value={filterAsset}
                  onChange={(e) => setFilterAsset(e.target.value)}
                  className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 outline-none"
                >
                  {assetOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>

                {/* Type filter */}
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as typeof filterType)}
                  className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 outline-none"
                >
                  <option value="todos">{t("hx_all_types")}</option>
                  <option value="compra">{t("hx_buys")}</option>
                  <option value="venda">{t("hx_sells")}</option>
                </select>

                {/* Sort */}
                <button
                  type="button"
                  onClick={() => setSortDesc((v) => !v)}
                  className="rounded-full border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-xs text-slate-200 hover:text-white transition"
                >
                  {sortDesc ? "↓ Mais recente" : "↑ Mais antigo"}
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
                      <tr key={tx.id} className="hover:bg-slate-800/30 transition group">
                        <td className="py-2.5 pr-3 text-slate-400 tabular-nums whitespace-nowrap">
                          {new Date(tx.date + "T12:00:00").toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "2-digit" })}
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className={`rounded-full px-2 py-0.5 font-semibold text-[10px] ${
                            tx.type === "compra"
                              ? "bg-emerald-500/15 text-emerald-400"
                              : "bg-rose-500/15 text-rose-400"
                          }`}>
                            {tx.type === "compra" ? "▲ Compra" : "▼ Venda"}
                          </span>
                        </td>
                        <td className="py-2.5 pr-3">
                          <span className="font-bold text-white">{tx.asset}</span>
                          <span className="ml-1 text-slate-500">{tx.assetName}</span>
                        </td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-slate-200">{fmtQty(tx.quantity, tx.asset)}</td>
                        <td className="py-2.5 pr-3 text-right tabular-nums text-slate-400">€ {fmtEur(tx.priceEur)}</td>
                        <td className={`py-2.5 pr-3 text-right tabular-nums font-semibold ${tx.type === "compra" ? "text-white" : "text-emerald-300"}`}>
                          {tx.type === "venda" ? "+" : ""}€ {fmtEur(tx.totalEur)}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-500">{tx.exchange}</td>
                        <td className="py-2.5 pr-3 text-slate-600 max-w-[120px] truncate" title={tx.notes}>{tx.notes || "—"}</td>
                        <td className="py-2.5">
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button
                              type="button"
                              onClick={() => handleEdit(tx)}
                              className="rounded px-2 py-1 text-[10px] text-slate-400 hover:text-white hover:bg-slate-700 transition"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(tx.id)}
                              className="rounded px-2 py-1 text-[10px] text-rose-400 hover:text-white hover:bg-rose-500/20 transition"
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden space-y-2">
                {filtered.map((tx) => (
                  <div key={tx.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          tx.type === "compra" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                        }`}>
                          {tx.type === "compra" ? "▲" : "▼"} {tx.type}
                        </span>
                        <span className="font-bold text-white text-sm">{tx.asset}</span>
                      </div>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => handleEdit(tx)} className="text-slate-500 hover:text-white text-xs px-1">✏️</button>
                        <button type="button" onClick={() => handleDelete(tx.id)} className="text-rose-500 hover:text-white text-xs px-1">✕</button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-slate-400">
                      <span>{fmtQty(tx.quantity, tx.asset)} {tx.asset}</span>
                      <span className="text-right">€ {fmtEur(tx.priceEur)} / un.</span>
                      <span className="text-slate-500">{new Date(tx.date + "T12:00:00").toLocaleDateString("pt-PT")}</span>
                      <span className={`text-right font-semibold ${tx.type === "compra" ? "text-white" : "text-emerald-300"}`}>
                        {tx.type === "venda" ? "+" : ""}€ {fmtEur(tx.totalEur)}
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

          {txs.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center">
              <p className="text-3xl mb-3">📋</p>
              <p className="text-sm text-slate-400">{t("hx_no_tx")}</p>
              <p className="text-xs text-slate-600 mt-1">{t("hx_no_tx_desc")}</p>
            </div>
          )}

          {/* ── Per-asset breakdown ── */}
          {txs.length > 0 && (() => {
            const byAsset = txs.reduce<Record<string, { compras: number; vendas: number; qtyNet: number; name: string }>>((acc, tx) => {
              if (!acc[tx.asset]) acc[tx.asset] = { compras: 0, vendas: 0, qtyNet: 0, name: tx.assetName };
              if (tx.type === "compra") { acc[tx.asset].compras += tx.totalEur; acc[tx.asset].qtyNet += tx.quantity; }
              else { acc[tx.asset].vendas += tx.totalEur; acc[tx.asset].qtyNet -= tx.quantity; }
              return acc;
            }, {});
            const rows = Object.entries(byAsset).sort((a, b) => b[1].compras - a[1].compras);
            if (rows.length === 0) return null;
            return (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
                <h2 className="text-sm font-bold text-white mb-4">{t("hx_summary_asset")}</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {rows.map(([sym, data]) => (
                    <div key={sym} className="rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-white text-sm">{sym}</p>
                          <p className="text-[10px] text-slate-500">{data.name}</p>
                        </div>
                        <span className={`text-xs font-semibold ${data.qtyNet > 0 ? "text-emerald-400" : "text-slate-500"}`}>
                          {fmtQty(Math.abs(data.qtyNet), sym)} {sym}
                        </span>
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                        <div>
                          <p className="text-[10px] text-slate-500">{t("hx_buys")}</p>
                          <p className="text-white font-medium">€ {fmtEur(data.compras)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500">{t("hx_sells")}</p>
                          <p className={data.vendas > 0 ? "text-emerald-300 font-medium" : "text-slate-500"}>
                            {data.vendas > 0 ? `€ ${fmtEur(data.vendas)}` : "—"}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

        </main>
      </div>
    </AppShell>
  );
}
