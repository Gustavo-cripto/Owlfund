"use client";

import EmptyState from "@/components/EmptyState";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { pnlAtivoManual } from "@/lib/wallets/totais";
import type { CryptoHoldings } from "@/lib/crypto/storage";
import type { MarketRow, MoneyFieldFn, QtyFieldFn } from "@/lib/wallets/tipos";

// Ativos cripto registados a mao: seletor "adicionar" e uma linha por ativo
// (investido, quantidade, data, preco, valor e PNL). Devolve um fragmento.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  marketRows: MarketRow[];
  cryptoHoldings: CryptoHoldings;
  toggleCryptoHolding: (symbol: string) => void;
  semAtivos: boolean;
  sortedCryptoSymbols: string[];
  cryptoPrices: Record<string, MarketRow>;
  usdToEurRate: number;
  moneyField: MoneyFieldFn;
  qtyField: QtyFieldFn;
  updateCryptoHolding: (symbol: string, next: { buyValue?: number; buyDate?: string; quantity?: number }) => void;
};

export default function AtivosManuaisLista({
  marketRows, cryptoHoldings, toggleCryptoHolding, semAtivos, sortedCryptoSymbols, cryptoPrices,
  usdToEurRate, moneyField, qtyField, updateCryptoHolding,
}: Props) {
  const { t } = useLanguage();
  const { format: fmtCur, symbol: curSym, formatMarketUsd: fmtMkt } = useCurrencyFormat();
  return (
    <>
      {/* Adicionar ativo manual */}
      <div className="flex items-center gap-2 pt-1">
        <select
          value=""
          onChange={(e) => { const s = e.target.value; if (s) toggleCryptoHolding(s); }}
          className="rounded-full border border-slate-700 bg-slate-950/80 px-3 py-2 text-xs font-semibold text-slate-200 outline-none hover:border-orange-400 transition cursor-pointer"
        >
          <option value="">{t("wl_add_manual_asset")}</option>
          {marketRows.filter((r) => !cryptoHoldings[r.symbol]).slice(0, 50).map((r) => (
            <option key={r.symbol} value={r.symbol}>{r.symbol} · {r.name}</option>
          ))}
        </select>
        <span className="text-[11px] text-slate-600">{t("wl_reg_no_wallet")}</span>
      </div>
      {semAtivos ? (
        <EmptyState compact icon="🪙" title={t("wl_no_asset_added")} description={t("wl_use_selector")} />
      ) : (
        sortedCryptoSymbols.map((symbol) => {
          const holding = cryptoHoldings[symbol] ?? {};
          const market = cryptoPrices[symbol];
          const { marketValueEur, pnlEur, pnlPct } = pnlAtivoManual(holding.quantity, holding.buyValue, market?.priceUsd, usdToEurRate);
          return (
            <div
              key={symbol}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-xs text-slate-100"
            >
              <div>
                <p className="font-semibold text-white">{symbol}</p>
                <p className="text-slate-500">{market?.name ?? "—"}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <label className="text-[11px] text-slate-600 px-1">{t("wl_invested")} ({curSym})</label>
                  {moneyField({ eur: holding.buyValue, onEur: (v) => updateCryptoHolding(symbol, { buyValue: v }), placeholder: "200", width: "w-36", ariaLabel: `${t("wl_invested")} ${symbol}` })}
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[11px] text-slate-600 px-1" title={t("wl_qty_hint")}>{t("wl_quantity")} ({symbol})</label>
                  {qtyField({ value: holding.quantity, onValue: (v) => updateCryptoHolding(symbol, { quantity: v }), placeholder: "0,5", title: t("wl_qty_hint"), width: "w-28", ariaLabel: `${t("wl_quantity")} ${symbol}` })}
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-[11px] text-slate-600 px-1">{t("wl_buy_date")}</label>
                  <input
                    type="date"
                    value={holding.buyDate ?? ""}
                    onChange={(event) =>
                      updateCryptoHolding(symbol, { buyDate: event.target.value })
                    }
                    className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-100 outline-none transition focus:border-orange-400"
                  />
                </div>
                <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                  {t("wl_current_price")}{" "}
                  <span className="font-semibold text-white">
                    {market
                      ? fmtMkt(market.priceUsd, { decimals: market.priceUsd < 1 ? 6 : 2 })
                      : "—"}
                  </span>
                </span>
                {marketValueEur != null ? (
                  <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                    {t("wl_market_value")}:{" "}
                    <span className="font-semibold text-white">{fmtCur(marketValueEur)}</span>
                  </span>
                ) : null}
                {pnlEur != null ? (
                  <span
                    className={`rounded-full border px-3 py-2 text-xs font-semibold ${
                      pnlEur >= 0
                        ? "border-emerald-800/50 bg-emerald-950/30 text-emerald-300"
                        : "border-rose-800/50 bg-rose-950/30 text-rose-300"
                    }`}
                  >
                    {t("wl_pnl")}: {pnlEur >= 0 ? "+" : ""}
                    {fmtCur(pnlEur)}
                    {pnlPct != null ? ` (${pnlEur >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)` : ""}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => toggleCryptoHolding(symbol)}
                  className="rounded-full border border-slate-700 px-3 py-2 text-[11px] font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                >
                  {t("wl_remove")}
                </button>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
