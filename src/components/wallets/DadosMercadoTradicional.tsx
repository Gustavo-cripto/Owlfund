"use client";

import ErrorNote from "@/components/ErrorNote";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { categoryLabel, type TraditionalAsset } from "@/lib/traditional/assets";
import type { TraditionalQuote } from "@/lib/wallets/tipos";

// Tradicional: caixa "dados de mercado" (cotacoes dos ativos escolhidos e total).
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  traditionalQuotesLoading: boolean;
  traditionalQuotesError: string | null;
  selectedTraditionalAssets: TraditionalAsset[];
  traditionalQuotes: Record<string, TraditionalQuote>;
  traditionalWithQty: number;
  traditionalMarketTotal: number;
  traditionalInvestedTotal: number;
};

export default function DadosMercadoTradicional({
  traditionalQuotesLoading, traditionalQuotesError, selectedTraditionalAssets, traditionalQuotes,
  traditionalWithQty, traditionalMarketTotal, traditionalInvestedTotal,
}: Props) {
  const { t } = useLanguage();
  const { format: fmtCur, numberFormat } = useCurrencyFormat();
  return (
    <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
          {t("wl_market_data")}
        </p>
        {traditionalQuotesLoading ? (
          <span className="text-xs text-slate-400">{t("wl_loading2")}</span>
        ) : null}
      </div>
      {traditionalQuotesError ? (
        <ErrorNote className="mt-2">{traditionalQuotesError}</ErrorNote>
      ) : null}
      <div className="mt-3 space-y-2">
        {selectedTraditionalAssets.length === 0 ? (
          <p className="text-sm text-slate-500">{t("wl_select_quotes")}</p>
        ) : (
          selectedTraditionalAssets.map((asset) => {
            const quote = asset.alphaSymbol
              ? traditionalQuotes[asset.alphaSymbol]
              : undefined;
            return (
              <div
                key={asset.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300"
              >
                <div>
                  <p className="font-semibold text-white">{asset.label}</p>
                  <p className="text-slate-500">{categoryLabel(asset.category, t)}</p>
                </div>
                {quote ? (
                  <div className="text-right">
                    <p className="text-white">
                      {quote.price != null ? quote.price.toFixed(2) : "—"}
                    </p>
                    <p
                      className={
                        quote.changePercent != null && quote.changePercent < 0
                          ? "text-rose-300"
                          : "text-emerald-300"
                      }
                    >
                      {quote.changePercent != null
                        ? `${quote.changePercent.toFixed(2)}%`
                        : "—"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Vol: {quote.volume != null ? quote.volume.toLocaleString(numberFormat) : "—"}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    {t("wl_no_market_data")}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
      {selectedTraditionalAssets.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
          <span
            className="text-xs text-slate-400"
            title={traditionalWithQty > 0 ? t("wl_trad_market_hint") : t("wl_trad_total_hint")}
          >
            {traditionalWithQty > 0 ? t("wl_trad_market") : t("wl_trad_total")} · {selectedTraditionalAssets.length} {selectedTraditionalAssets.length === 1 ? t("wl_asset_one") : t("wl_asset_many")}
          </span>
          <span className="text-sm font-semibold text-white">{fmtCur(traditionalWithQty > 0 ? traditionalMarketTotal : traditionalInvestedTotal)}</span>
        </div>
      )}
    </div>
  );
}
