"use client";

import ErrorNote from "@/components/ErrorNote";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { cleanDecimalInput } from "@/lib/format/decimal";
import type { MarketRow } from "@/lib/wallets/tipos";

// Secao "adicionar ativo cripto manual": escolher moeda, data, valor e quantidade.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  manualCryptoSelectRef: React.RefObject<HTMLDivElement | null>;
  manualCryptoSelectOpen: boolean;
  setManualCryptoSelectOpen: React.Dispatch<React.SetStateAction<boolean>>;
  manualCryptoAssetSymbol: string;
  setManualCryptoAssetSymbol: (value: string) => void;
  manualCryptoFilter: string;
  setManualCryptoFilter: (value: string) => void;
  cryptoSelectList: Array<{ symbol: string; name: string }>;
  marketRows: MarketRow[];
  cryptoPricesLoading: boolean;
  manualCryptoAssetDate: string;
  setManualCryptoAssetDate: (value: string) => void;
  manualCryptoAssetAmountUsd: string;
  setManualCryptoAssetAmountUsd: (value: string) => void;
  manualCryptoAssetQty: string;
  setManualCryptoAssetQty: (value: string) => void;
  handleManualAddCryptoAsset: () => void;
  manualCryptoAssetError: string | null;
};

export default function AtivoCriptoManualSecao({
  manualCryptoSelectRef, manualCryptoSelectOpen, setManualCryptoSelectOpen,
  manualCryptoAssetSymbol, setManualCryptoAssetSymbol, manualCryptoFilter, setManualCryptoFilter,
  cryptoSelectList, marketRows, cryptoPricesLoading, manualCryptoAssetDate,
  setManualCryptoAssetDate, manualCryptoAssetAmountUsd, setManualCryptoAssetAmountUsd,
  manualCryptoAssetQty, setManualCryptoAssetQty, handleManualAddCryptoAsset,
  manualCryptoAssetError,
}: Props) {
  const { t } = useLanguage();
  const { symbol: curSym, currency: curCode } = useCurrencyFormat();
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h3 className="text-sm font-semibold text-white">{t("wl_manual_crypto")}</h3>
      <p className="mt-1 text-xs text-slate-500">
        {t("wl_manual_asset_intro")} <span className="text-slate-300 font-medium">{curCode} ({curSym})</span>. {t("wl_manual_asset_tail")}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px]" ref={manualCryptoSelectRef}>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-left text-xs text-slate-200 outline-none transition focus:border-orange-400"
            onClick={() => setManualCryptoSelectOpen((o) => !o)}
          >
            <span className="truncate">
              {manualCryptoAssetSymbol
                ? (() => {
                    const list = cryptoSelectList.length > 0 ? cryptoSelectList : marketRows.map((r) => ({ symbol: r.symbol, name: r.name }));
                    const name = list.find((r) => r.symbol === manualCryptoAssetSymbol)?.name;
                    return name ? `${manualCryptoAssetSymbol} · ${name}` : manualCryptoAssetSymbol;
                  })()
                : t("wl_select_crypto")}
            </span>
            <span className="text-slate-500">{manualCryptoSelectOpen ? "▲" : "▼"}</span>
          </button>
          {manualCryptoSelectOpen ? (
            <div className="absolute left-0 top-full z-50 mt-1 w-full min-w-[280px] rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
              <input
                type="text"
                className="w-full border-b border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-500 outline-none"
                placeholder={t("wl_search_symbol")}
                value={manualCryptoFilter}
                onChange={(e) => setManualCryptoFilter(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
              />
              <div className="max-h-[280px] overflow-y-auto py-1">
                {cryptoPricesLoading && cryptoSelectList.length === 0 && marketRows.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-slate-500">{t("wl_loading_api")}</p>
                ) : (() => {
                  const list = cryptoSelectList.length > 0 ? cryptoSelectList : marketRows.map((r) => ({ symbol: r.symbol, name: r.name }));
                  const filtered = list.filter(
                    (row) =>
                      !manualCryptoFilter.trim() ||
                      row.symbol.toLowerCase().includes(manualCryptoFilter.trim().toLowerCase()) ||
                      (row.name && row.name.toLowerCase().includes(manualCryptoFilter.trim().toLowerCase()))
                  );
                  if (filtered.length === 0) {
                    return (
                      <p className="px-3 py-4 text-center text-xs text-slate-500">
                        {list.length === 0 ? t("wl_loading_api") : t("wl_no_asset_found")}
                      </p>
                    );
                  }
                  return filtered.map((row) => (
                    <button
                      key={row.symbol}
                      type="button"
                      className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
                      onClick={() => {
                        setManualCryptoAssetSymbol(row.symbol);
                        setManualCryptoSelectOpen(false);
                        setManualCryptoFilter("");
                      }}
                    >
                      <span className="font-medium">{row.symbol}</span>
                      {row.name ? <span className="text-slate-500">{row.name}</span> : null}
                    </button>
                  ));
                })()}
              </div>
            </div>
          ) : null}
        </div>
        <input
          type="date"
          className="rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none transition focus:border-orange-400"
          value={manualCryptoAssetDate}
          onChange={(e) => setManualCryptoAssetDate(e.target.value)}
        />
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">{curSym}</span>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            className="w-36 rounded-full border border-slate-800 bg-slate-950/60 pl-7 pr-12 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-500 transition focus:border-orange-400"
            placeholder={t("wl_value")}
            value={manualCryptoAssetAmountUsd}
            onChange={(e) => setManualCryptoAssetAmountUsd(cleanDecimalInput(e.target.value))}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-500">{curCode}</span>
        </div>
        <input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          title={t("wl_qty_hint")}
          className="w-32 rounded-full border border-slate-800 bg-slate-950/60 px-4 py-2 text-xs text-slate-200 outline-none placeholder:text-slate-500 transition focus:border-orange-400"
          placeholder={`${t("wl_quantity")} (opc.)`}
          value={manualCryptoAssetQty}
          onChange={(e) => setManualCryptoAssetQty(cleanDecimalInput(e.target.value))}
        />
        <button
          type="button"
          className="rounded-full border border-orange-400/40 px-4 py-2 text-xs font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
          onClick={handleManualAddCryptoAsset}
        >
          {t("wl_add")}
        </button>
      </div>
      {manualCryptoAssetError ? (
        <ErrorNote className="mt-2">{manualCryptoAssetError}</ErrorNote>
      ) : null}
    </section>
  );
}
