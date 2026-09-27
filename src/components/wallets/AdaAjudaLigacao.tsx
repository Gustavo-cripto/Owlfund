"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { StoredWalletEntry } from "@/lib/wallets/storage";

// Cartao Cardano sem carteira: guia do Eternl e ligacao por QR (CIP-45).
// Devolve um fragmento para o DOM ficar igual.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  adaAddress: string | undefined;
  adaWallets: StoredWalletEntry[];
  adaPeerAddress: string | null;
  adaPeerConnecting: boolean;
  handleAdaPeerConnect: () => unknown;
  adaQrCanvasRef: React.RefObject<HTMLDivElement | null>;
  onPeerCancel: () => void;
};

export default function AdaAjudaLigacao({
  adaAddress, adaWallets, adaPeerAddress, adaPeerConnecting, handleAdaPeerConnect, adaQrCanvasRef,
  onPeerCancel,
}: Props) {
  const { t } = useLanguage();
  return (
    <>
      {/* Eternl setup guide — shown when not connected */}
      {!adaAddress && adaWallets.length === 0 && (
        <details className="rounded-xl border border-slate-800 bg-slate-900/40">
          <summary className="cursor-pointer px-4 py-2.5 text-xs text-slate-400 hover:text-slate-200 transition select-none">
            ℹ️ {t("wl_eternl_howto")}
          </summary>
          <div className="px-4 pb-4 pt-2 space-y-1.5 text-xs text-slate-400">
            <p className="font-semibold text-slate-300 mb-2">{t("wl_eternl_before")}</p>
            <p>1. {t("wl_et_s1")} <strong className="text-slate-200">Settings</strong> {t("wl_et_s1b")}</p>
            <p>2. {t("wl_et_s2")} <strong className="text-slate-200">dApp Connector</strong></p>
            <p>3. {t("wl_et_s3")}</p>
            <p>4. {t("wl_et_s4")}</p>
            <p className="font-semibold text-slate-300 mt-3 mb-1">{t("wl_eternl_after")}</p>
            <p>5. {t("wl_et_s5")} <strong className="text-slate-200">{t("wl_et_icon")}</strong> {t("wl_et_s5b")}</p>
            <p>6. {t("wl_et_s6")} <strong className="text-slate-200">Approve</strong></p>
          </div>
        </details>
      )}
      {/* CIP-45 Peer Connect — for Eternl companion/mobile */}
      {!adaAddress && adaWallets.length === 0 && (
        <div className="space-y-2">
          {!adaPeerAddress && !adaPeerConnecting && (
            <button
              type="button"
              onClick={() => void handleAdaPeerConnect()}
              className="w-full rounded-xl border border-slate-700 py-2 text-xs text-slate-400 hover:border-orange-500/40 hover:text-orange-300 transition"
            >
              📱 {t("wl_ada_qr_btn")}
            </button>
          )}
          {adaPeerConnecting && !adaPeerAddress && (
            <p className="text-xs text-slate-400 animate-pulse">{t("wl_gen_code")}</p>
          )}
          {adaPeerAddress && (
            <div className="rounded-xl border border-orange-500/20 bg-slate-900/60 p-4 space-y-3">
              <p className="text-xs font-semibold text-orange-400">{t("wl_cip45_code")}</p>
              <div ref={adaQrCanvasRef} className="flex justify-center" />
              <p className="text-[11px] text-slate-500 break-all font-mono bg-slate-950 rounded p-2 select-all">{adaPeerAddress}</p>
              <p className="text-[11px] text-slate-400">{t("wl_ada_qr_hint_a")} <strong className="text-slate-200">{t("wl_ada_link_dapp")}</strong> {t("wl_ada_qr_hint_b")}</p>
              <button type="button" onClick={onPeerCancel} className="text-xs text-slate-500 hover:text-slate-300">✕ {t("cancel")}</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
