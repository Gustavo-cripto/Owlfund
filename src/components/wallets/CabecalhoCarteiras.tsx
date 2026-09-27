"use client";

import Segmentos from "@/components/ui/Segmentos";
import QuickAddCard from "@/components/wallets/QuickAddCard";
import { FREE_WALLET_LIMIT } from "@/lib/plans";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// Cabecalho da pagina de carteiras: titulo, campo rapido (sem carteiras), aviso
// "so leitura", contador do plano gratis e o seletor Blockchain/Tradicional.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  totalWallets: number;
  quickAddr: string;
  quickMsg: { ok: boolean; text: string } | null;
  quickFromDemo: boolean;
  onQuickAddrChange: (value: string) => void;
  onQuickSubmit: () => void;
  isLoadingAuth: boolean;
  isPro: boolean;
  paymentsFrozen: boolean;
  walletMode: "web3" | "tradicional";
  onWalletModeChange: (mode: "web3" | "tradicional") => void;
};

export default function CabecalhoCarteiras({
  totalWallets, quickAddr, quickMsg, quickFromDemo, onQuickAddrChange, onQuickSubmit,
  isLoadingAuth, isPro, paymentsFrozen, walletMode, onWalletModeChange,
}: Props) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
        {t("nav_wallets")}
      </p>
      <h1 className="text-3xl font-semibold text-white">
        {t("port_blockchain")} · {t("port_traditional")}
      </h1>
      <p className="max-w-2xl text-sm text-slate-400">
        {t("wl_intro")}
      </p>
      {totalWallets === 0 && (
        <QuickAddCard
          quickAddr={quickAddr}
          quickMsg={quickMsg}
          quickFromDemo={quickFromDemo}
          onAddrChange={onQuickAddrChange}
          onSubmit={onQuickSubmit}
        />
      )}
      <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm text-blue-300">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0">
          <path d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" />
        </svg>
        <span>{t("wl_readonly_banner")}</span>
      </div>
      {isLoadingAuth ? null : isPro ? (
        <p className="text-xs text-emerald-300">
          {t("wl_sync_active")}
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <p className="text-xs text-slate-500">
            {t("nav_wallets")}: <span className={totalWallets >= FREE_WALLET_LIMIT ? "text-rose-400 font-semibold" : "text-slate-300 font-semibold"}>{totalWallets}/{FREE_WALLET_LIMIT}</span>
            {" "}({t("free")}){" "}
            {totalWallets >= FREE_WALLET_LIMIT && (
              <a href={paymentsFrozen ? "/beta" : "/pricing"} className="text-orange-400 underline hover:text-orange-300">{paymentsFrozen ? `🧪 ${t("dash_beta_cta_short")} →` : t("wl_upgrade_pro")}</a>
            )}
          </p>
        </div>
      )}
      <Segmentos
        valor={walletMode}
        aoMudar={onWalletModeChange}
        opcoes={[{ id: "web3", label: t("port_blockchain") }, { id: "tradicional", label: t("port_traditional") }]}
      />
    </div>
  );
}
