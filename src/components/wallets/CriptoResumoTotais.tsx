"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { totalGeralEur } from "@/lib/wallets/totais";
import type { MarketRow } from "@/lib/wallets/tipos";

// Topo da secao cripto: total geral e a caixa "saldos e NFTs" por cadeia.
// Devolve um fragmento para o DOM ficar igual.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  walletsTotalUsd: number;
  totalDefiUsd: number;
  cexHlTotalUsd: number;
  coldTokensExtraUsd: number;
  usdToEurRate: number;
  cryptoManualTotal: number;
  stablecoinTotalEur: number;
  web3Prices: Record<string, MarketRow>;
  evmNativeUsd: number;
  totalSolBalance: string;
  totalBtcBalance: string;
  totalAdaBalance: string;
  getFiatValue: (symbol: string, balanceValue?: string | number | null) => number | null;
  totalNftCount: number;
};

export default function CriptoResumoTotais({
  walletsTotalUsd, totalDefiUsd, cexHlTotalUsd, coldTokensExtraUsd, usdToEurRate,
  cryptoManualTotal, stablecoinTotalEur, web3Prices, evmNativeUsd, totalSolBalance,
  totalBtcBalance, totalAdaBalance, getFiatValue, totalNftCount,
}: Props) {
  const { t } = useLanguage();
  const { format: fmtCur, hideBalances } = useCurrencyFormat();
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">{t("wl_crypto_wallet")}</h2>
          <p className="text-sm text-slate-400">
            {t("wl_manual_crypto_intro")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
            {t("wl_total_all")}
          </p>
          <p className="text-lg font-semibold text-white">
            {fmtCur(totalGeralEur({ walletsTotalUsd, totalDefiUsd, cexHlTotalUsd, coldTokensExtraUsd, usdToEurRate, cryptoManualTotal, stablecoinTotalEur }))}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-700/80 bg-slate-950/50 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          {t("wl_balances_nfts")}
        </p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-300">
          <span title="ETH + POL, BNB, AVAX… (nativo de cada rede EVM)">
            <span className="text-slate-500">ETH/EVM:</span>{" "}
            {web3Prices.ETH ? fmtCur(evmNativeUsd * usdToEurRate) : "—"}
          </span>
          <span>
            <span className="text-slate-500">SOL:</span>{" "}
            {getFiatValue("SOL", totalSolBalance) != null
              ? fmtCur((getFiatValue("SOL", totalSolBalance) ?? 0) * usdToEurRate)
              : "—"}
          </span>
          <span>
            <span className="text-slate-500">BTC:</span>{" "}
            {getFiatValue("BTC", totalBtcBalance) != null
              ? fmtCur((getFiatValue("BTC", totalBtcBalance) ?? 0) * usdToEurRate)
              : "—"}
          </span>
          <span>
            <span className="text-slate-500">ADA:</span>{" "}
            {getFiatValue("ADA", totalAdaBalance) != null
              ? fmtCur((getFiatValue("ADA", totalAdaBalance) ?? 0) * usdToEurRate)
              : "—"}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="text-slate-500">{t("wl_total_wallets")}</span>{" "}
            <span className="font-semibold text-white">
              {fmtCur((walletsTotalUsd + cexHlTotalUsd) * usdToEurRate)}
            </span>
          </span>
          <span>
            <span className="text-slate-500">DeFi:</span>{" "}
            <span className="font-semibold text-white">
              {fmtCur(totalDefiUsd * usdToEurRate)}
            </span>
          </span>
          {cexHlTotalUsd > 0 && (
            <span>
              <span className="text-slate-500">CEX / HL:</span>{" "}
              <span className="font-semibold text-white">
                {fmtCur(cexHlTotalUsd * usdToEurRate)}
              </span>
            </span>
          )}
          {cryptoManualTotal > 0 && (
            <span title={t("wl_manual_hint")}>
              <span className="text-slate-500">{t("wl_manual_label")}</span>{" "}
              <span className="font-semibold text-white">{fmtCur(cryptoManualTotal)}</span>
            </span>
          )}
          {coldTokensExtraUsd > 0 && (
            <span title={t("wl_tokens_hint")}>
              <span className="text-slate-500">{t("wl_tokens_label")}</span>{" "}
              <span className="font-semibold text-white">{fmtCur(coldTokensExtraUsd * usdToEurRate)}</span>
            </span>
          )}
          {stablecoinTotalEur > 0 && (
            <span>
              <span className="text-slate-500">{t("wl_stable_label")}</span>{" "}
              <span className="font-semibold text-white">{fmtCur(stablecoinTotalEur)}</span>
            </span>
          )}
          <span>
            <span className="text-slate-500">NFTs:</span>{" "}
            <span className="font-semibold text-white">
              {hideBalances ? "••••" : <>{totalNftCount} {totalNftCount === 1 ? "item" : "itens"}</>}
            </span>
          </span>
        </div>
      </div>
    </>
  );
}
