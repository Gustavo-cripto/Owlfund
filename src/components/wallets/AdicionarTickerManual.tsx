"use client";

import Segmentos from "@/components/ui/Segmentos";
import { btnPrimary } from "@/lib/ui/buttons";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { categoryLabel, type TraditionalAsset } from "@/lib/traditional/assets";

// Tradicional: adicionar uma acao/ETF pelo ticker e a lista dos adicionados.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  customTickerCategory: "Ações" | "ETFs";
  setCustomTickerCategory: (category: "Ações" | "ETFs") => void;
  customTickerInput: string;
  setCustomTickerInput: (value: string) => void;
  customAssets: TraditionalAsset[];
  onAddTicker: () => void;
  onRemoveCustomAsset: (asset: TraditionalAsset) => void;
};

export default function AdicionarTickerManual({
  customTickerCategory, setCustomTickerCategory, customTickerInput, setCustomTickerInput,
  customAssets, onAddTicker, onRemoveCustomAsset,
}: Props) {
  const { t } = useLanguage();
  return (
    <div className="mt-5 rounded-xl border border-slate-700 bg-slate-900/40 p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{t("wl_add_stock")}</p>
      <Segmentos tamanho="sm" valor={customTickerCategory} aoMudar={setCustomTickerCategory} opcoes={[{ id: "Ações", label: "Ações" }, { id: "ETFs", label: "ETFs" }]} />
      <div className="flex gap-2">
        <input
          type="text"
          placeholder={t("wl_ph_ticker")}
          value={customTickerInput}
          onChange={(e) => setCustomTickerInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onAddTicker();
            }
          }}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono uppercase"
        />
        <button
          type="button"
          onClick={onAddTicker}
          className={`${btnPrimary} px-4 py-2 text-sm`}
        >
          {t("wl_add")}
        </button>
      </div>
      {customAssets.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customAssets.map((a) => (
            <span key={a.id} className="flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs text-orange-200">
              {a.id} <span className="text-slate-500">({categoryLabel(a.category, t)})</span>
              <button
                type="button"
                onClick={() => onRemoveCustomAsset(a)}
                className="ml-1 text-slate-500 hover:text-rose-400"
              >×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
