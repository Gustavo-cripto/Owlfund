"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { categoryLabel, type TraditionalAsset } from "@/lib/traditional/assets";
import { hasQuantity, traditionalHoldingValueEur, type TraditionalHoldings } from "@/lib/traditional/storage";
import type { MoneyFieldFn, QtyFieldFn, TraditionalQuote } from "@/lib/wallets/tipos";

// Tradicional: ativos escolhidos (ordenar, quantidade, valor, data, cotacao, PNL).
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  traditionalSortKey: "date" | "marketCap";
  setTraditionalSortKey: (key: "date" | "marketCap") => void;
  traditionalSortDir: "asc" | "desc";
  setTraditionalSortDir: React.Dispatch<React.SetStateAction<"asc" | "desc">>;
  sortedTraditionalAssets: TraditionalAsset[];
  traditionalHoldings: TraditionalHoldings;
  traditionalQuotes: Record<string, TraditionalQuote>;
  traditionalQuoteLoading: Record<string, boolean>;
  quotePriceEur: (quote?: TraditionalQuote) => number | undefined;
  qtyField: QtyFieldFn;
  moneyField: MoneyFieldFn;
  updateTraditionalBuy: (assetId: string, next: { buyValue?: number; buyDate?: string; quantity?: number }) => void;
  traditionalPnlRange: Record<string, "1d" | "30d" | "60d" | "1y">;
  setTraditionalPnlRange: React.Dispatch<React.SetStateAction<Record<string, "1d" | "30d" | "60d" | "1y">>>;
  getTraditionalPnl: (assetId: string, changePercent?: number | null) => { label: string; value: number | null };
  refreshTraditionalQuote: (symbol?: string) => unknown;
  toggleTraditional: (assetId: string) => void;
  onClear: () => void;
};

export default function TradicionaisSelecionados({
  traditionalSortKey, setTraditionalSortKey, traditionalSortDir, setTraditionalSortDir,
  sortedTraditionalAssets, traditionalHoldings, traditionalQuotes, traditionalQuoteLoading,
  quotePriceEur, qtyField, moneyField, updateTraditionalBuy, traditionalPnlRange,
  setTraditionalPnlRange, getTraditionalPnl, refreshTraditionalQuote, toggleTraditional, onClear,
}: Props) {
  const { t } = useLanguage();
  const { format: fmtCur, symbol: curSym, hideBalances } = useCurrencyFormat();
  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {t("wl_selected")}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
        >
          {t("wl_clear_sel")}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={traditionalSortKey}
          onChange={(event) =>
            setTraditionalSortKey(event.target.value as "date" | "marketCap")
          }
          className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 outline-none"
        >
          <option value="date">{t("wl_buy_date")}</option>
          <option value="marketCap">{t("mc_sort_mcap")}</option>
        </select>
        <button
          type="button"
          onClick={() =>
            setTraditionalSortDir((prev) => (prev === "asc" ? "desc" : "asc"))
          }
          className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
        >
          {traditionalSortDir === "asc" ? t("wl_asc") : t("wl_desc")}
        </button>
      </div>

      {sortedTraditionalAssets.length === 0 ? (
        <span className="mt-3 block text-sm text-slate-500">
          {t("wl_none_selected")}
        </span>
      ) : (
        <div className="mt-3 grid gap-3">
          {sortedTraditionalAssets.map((asset) => {
            const buy = traditionalHoldings[asset.id] ?? {};
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
                  <p className="text-slate-500">{categoryLabel(asset.category, t)}</p>
                  {(() => {
                    // O valor de hoje so aparece quando ha quantidade E cotacao:
                    // sem quantidade nao existe valor de mercado, e apresentar o
                    // montante investido como se fosse o valor atual seria mentira.
                    const priceEur = quotePriceEur(quote);
                    if (!hasQuantity(buy) || priceEur == null) return null;
                    const nowEur = traditionalHoldingValueEur(buy, priceEur);
                    const invested = Number(buy.buyValue ?? 0);
                    const diff = invested > 0 ? nowEur - invested : null;
                    return (
                      <p className="mt-1 text-[11px] text-slate-400">
                        {t("wl_market_value")}:{" "}
                        <span className="font-semibold text-white">{fmtCur(nowEur)}</span>
                        {diff != null && !hideBalances ? (
                          <span className={diff >= 0 ? " text-emerald-300" : " text-rose-300"}>
                            {" "}
                            ({diff >= 0 ? "+" : "−"}
                            {fmtCur(Math.abs(diff))})
                          </span>
                        ) : null}
                      </p>
                    );
                  })()}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {qtyField({ value: buy.quantity, onValue: (v) => updateTraditionalBuy(asset.id, { quantity: v }), placeholder: t("wl_quantity"), title: t("wl_trad_qty_hint"), width: "w-28", ariaLabel: `${t("wl_quantity")} ${asset.id}` })}
                  {moneyField({ eur: buy.buyValue, onEur: (v) => updateTraditionalBuy(asset.id, { buyValue: v }), placeholder: `${t("wl_buy_value")} (${curSym})`, width: "w-40", ariaLabel: `${t("wl_buy_value")} ${asset.id}` })}
                  <input
                    type="date"
                    value={buy.buyDate ?? ""}
                    onChange={(event) =>
                      updateTraditionalBuy(asset.id, { buyDate: event.target.value })
                    }
                    className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                  />
                  <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                    {t("wl_current_price")}{" "}
                    <span className="font-semibold text-white">
                      {quote?.price != null
                        ? `${quote.price.toFixed(2)} ${(quote.currency ?? "USD").toUpperCase()}`
                        : "—"}
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
                      <option value="1d">{t("wl_daily")}</option>
                      <option value="30d">{t("pc_30_days")}</option>
                      <option value="60d">{t("wl_60_days")}</option>
                      <option value="1y">{t("wl_annual")}</option>
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
                          {value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`}
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
                    {isQuoteLoading ? t("wl_updating") : t("wl_update_price")}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleTraditional(asset.id)}
                    className="rounded-full border border-slate-700 px-3 py-2 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                    title={t("wl_remove")}
                  >
                    {t("wl_remove")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
