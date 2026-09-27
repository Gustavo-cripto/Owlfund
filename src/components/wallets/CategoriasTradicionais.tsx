"use client";

import Segmentos from "@/components/ui/Segmentos";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { categoryLabel, traditionalCategories, type TraditionalAsset } from "@/lib/traditional/assets";
import type { TraditionalHoldings } from "@/lib/traditional/storage";

// Tradicional: filtro por categoria e grelha de ativos para escolher.
// Devolve um fragmento para o DOM ficar igual.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  traditionalCategory: string;
  setTraditionalCategory: (category: string) => void;
  visibleTraditionalAssets: TraditionalAsset[];
  traditionalHoldings: TraditionalHoldings;
  toggleTraditional: (assetId: string) => void;
};

export default function CategoriasTradicionais({
  traditionalCategory, setTraditionalCategory, visibleTraditionalAssets, traditionalHoldings,
  toggleTraditional,
}: Props) {
  const { t } = useLanguage();
  return (
    <>
      <Segmentos className="mt-5" tamanho="sm" wrap valor={traditionalCategory} aoMudar={setTraditionalCategory} opcoes={traditionalCategories.map((c) => ({ id: c, label: categoryLabel(c, t) }))} />

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {visibleTraditionalAssets.map((asset) => {
          const checked = !!traditionalHoldings[asset.id];
          return (
            <button
              key={asset.id}
              type="button"
              onClick={() => toggleTraditional(asset.id)}
              aria-pressed={checked}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-left text-sm transition ${
                checked
                  ? "border-orange-400/60 bg-orange-500/10 text-orange-100"
                  : "border-slate-800 bg-slate-950/60 text-slate-200 hover:border-slate-600"
              }`}
            >
              <div className="flex flex-col">
                <span className="font-semibold">{asset.label}</span>
                <span className="text-xs text-slate-500">{categoryLabel(asset.category, t)}</span>
              </div>
              <span
                className={`grid h-6 w-6 place-items-center rounded-full border text-xs font-semibold ${
                  checked
                    ? "border-orange-400 bg-orange-500/20 text-orange-100"
                    : "border-slate-700 text-slate-400"
                }`}
              >
                {checked ? "✓" : "+"}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
