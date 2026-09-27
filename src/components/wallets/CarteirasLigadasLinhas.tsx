"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { ethBalanceKey } from "@/lib/wallets/formatar";
import type { StoredWalletEntry } from "@/lib/wallets/storage";
import type { MarketRow } from "@/lib/wallets/tipos";

// Lista cripto: uma linha por carteira ligada (ETH, SOL, BTC, ADA) com saldo,
// valor e preco atual. Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  ethWallets: StoredWalletEntry[];
  solWallets: StoredWalletEntry[];
  btcWallets: StoredWalletEntry[];
  adaWallets: StoredWalletEntry[];
  ethBalancesLoading: Record<string, boolean>;
  ethBalancesByKey: Record<string, string>;
  solBalancesByAddress: Record<string, string>;
  btcBalancesByAddress: Record<string, string>;
  adaBalancesByAddress: Record<string, string>;
  cryptoPrices: Record<string, MarketRow>;
  getFiatValue: (symbol: string, balanceValue?: string | number | null) => number | null;
  usdToEurRate: number;
  onRemoveEth: (index: number) => void;
  onRemoveSol: (index: number) => void;
  onRemoveBtc: (index: number) => void;
  onRemoveAda: (index: number) => void;
};

export default function CarteirasLigadasLinhas({
  ethWallets, solWallets, btcWallets, adaWallets, ethBalancesLoading, ethBalancesByKey,
  solBalancesByAddress, btcBalancesByAddress, adaBalancesByAddress, cryptoPrices, getFiatValue,
  usdToEurRate, onRemoveEth, onRemoveSol, onRemoveBtc, onRemoveAda,
}: Props) {
  const { t } = useLanguage();
  const { format: fmtCur, hideBalances, formatMarketUsd: fmtMkt } = useCurrencyFormat();
  type WEntry = { key: string; symbol: string; label: string; network: string; balance: string | null; source: string; onRemove: () => void };
  const entries: WEntry[] = [];

  // ETH — cada carteira separada
  ethWallets.forEach((w, i) => {
    const k = ethBalanceKey(w.address ?? "", w.network ?? "Ethereum");
    const bal = ethBalancesLoading[k] || ethBalancesByKey[k] === undefined ? null : (ethBalancesByKey[k] ?? null);
    entries.push({
      key: `eth-${i}-${w.address}`,
      symbol: "ETH",
      label: w.label ?? w.network ?? "Ethereum",
      network: w.network ?? "Ethereum",
      balance: bal,
      source: `${t("wl_wallet")} ETH`,
      onRemove: () => onRemoveEth(i),
    });
  });

  // SOL — cada carteira separada
  solWallets.forEach((w, i) => {
    const bal = w.address ? (solBalancesByAddress[w.address] ?? w.balance ?? null) : null;
    entries.push({
      key: `sol-${i}-${w.address}`,
      symbol: "SOL",
      label: w.label ?? w.network ?? "Solana",
      network: w.network ?? "Solana",
      balance: bal,
      source: `${t("wl_wallet")} SOL`,
      onRemove: () => onRemoveSol(i),
    });
  });

  // BTC — cada carteira separada
  btcWallets.forEach((w, i) => {
    const bal = w.address ? (btcBalancesByAddress[w.address] ?? w.balance ?? null) : null;
    entries.push({
      key: `btc-${i}-${w.address}`,
      symbol: "BTC",
      label: w.label ?? "Bitcoin",
      network: "Bitcoin",
      balance: bal,
      source: `${t("wl_wallet")} BTC`,
      onRemove: () => onRemoveBtc(i),
    });
  });

  // ADA — cada carteira separada
  adaWallets.forEach((w, i) => {
    const bal = w.address ? (adaBalancesByAddress[w.address] ?? w.balance ?? null) : null;
    entries.push({
      key: `ada-${i}-${w.address}`,
      symbol: "ADA",
      label: w.label ?? "Cardano",
      network: "Cardano",
      balance: bal,
      source: `${t("wl_wallet")} ADA`,
      onRemove: () => onRemoveAda(i),
    });
  });

  if (entries.length === 0) return null;
  return entries.map(({ key, symbol, label, network, balance, source, onRemove }) => {
    const market = cryptoPrices[symbol];
    const balNum = balance !== null && balance !== "—" ? parseFloat(balance) || 0 : 0;
    const fiatUsd = getFiatValue(symbol, balance);
    const fiatEur = fiatUsd != null ? fiatUsd * usdToEurRate : null;
    return (
      <div
        key={key}
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-xs text-slate-100"
      >
        <div>
          <p className="font-semibold text-white">{symbol}</p>
          <p className="text-slate-500">{label !== network ? label : network}</p>
          <p className="mt-0.5 text-[11px] text-slate-600 uppercase tracking-wide">{network !== label ? `${source} · ${network}` : source}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-right">
          <div>
            {hideBalances
              ? <p className="text-slate-300 tabular-nums">••••</p>
              : balance === null
              ? <p className="text-slate-500 italic">{t("wl_loading")}</p>
              : <p className="text-slate-300 tabular-nums">{balNum > 0 ? balNum.toFixed(symbol === "BTC" ? 8 : 4) : "—"} {symbol}</p>
            }
            {fiatEur != null && fiatEur > 0 && (
              <p className="text-slate-500">{fmtCur(fiatEur)}</p>
            )}
          </div>
          <span className="rounded-full border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
            {t("wl_current_price")}{" "}
            <span className="font-semibold text-white">
              {market
                ? fmtMkt(market.priceUsd, { decimals: market.priceUsd < 1 ? 6 : 2 })
                : "—"}
            </span>
          </span>
          <button
            onClick={onRemove}
            title={t("wl_remove_wallet")}
            className="rounded-full border border-rose-800/40 bg-rose-950/30 p-2 text-rose-400 transition hover:bg-rose-900/50 hover:text-rose-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      </div>
    );
  });
}
