"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

// Resumo dos Runes no cartao Bitcoin (linha "Runes:" do WalletCard).
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  btcAddress: string | undefined;
  btcWalletsCount: number;
  btcRunesSummary: { loading: boolean; runes: Array<{ symbol: string; amount: number | string; displayName: string }> };
  formatRuneAmount: (amount: number | string) => string;
};

export default function BtcRunesResumo({ btcAddress, btcWalletsCount, btcRunesSummary, formatRuneAmount }: Props) {
  const { t } = useLanguage();
  return (
    !btcAddress && btcWalletsCount === 0 ? (
      <span className="text-slate-500">—</span>
    ) : btcRunesSummary.loading ? (
      <span className="text-slate-400">{t("wl_loading")}</span>
    ) : btcRunesSummary.runes.length > 0 ? (
      <div className="mt-1 space-y-1 text-amber-200/90">
        {btcRunesSummary.runes.map((r) => (
          <div key={r.symbol} className="flex justify-between gap-3 text-xs">
            <span className="truncate" title={r.displayName}>{r.displayName}</span>
            <span className="shrink-0 tabular-nums">{formatRuneAmount(r.amount)}</span>
          </div>
        ))}
      </div>
    ) : (
      <span className="text-slate-500">—</span>
    )
  );
}
