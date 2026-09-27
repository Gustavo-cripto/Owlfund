"use client";

import { btnPrimary } from "@/lib/ui/buttons";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// Campo rapido "cola um endereco" — so aparece quando ainda nao ha carteiras.
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): o estado continua na pagina.
type Props = {
  quickAddr: string;
  quickMsg: { ok: boolean; text: string } | null;
  quickFromDemo: boolean;
  onAddrChange: (value: string) => void;
  onSubmit: () => void;
};

export default function QuickAddCard({ quickAddr, quickMsg, quickFromDemo, onAddrChange, onSubmit }: Props) {
  const { t } = useLanguage();
  return (
    <div className="rounded-2xl border border-orange-500/30 bg-orange-500/[0.06] p-5">
      <p className="text-sm font-bold text-white">🚀 {t("wl_quick_title")}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">{t("wl_quick_desc")} {t("wl_hw_addr_hint")}</p>
      <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
        <label htmlFor="wl-quick" className="sr-only">{t("wl_quick_ph")}</label>
        <input
          id="wl-quick"
          value={quickAddr}
          onChange={(e) => onAddrChange(e.target.value)}
          placeholder={t("wl_quick_ph")}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 font-mono text-sm text-slate-100 outline-none transition placeholder:font-sans placeholder:text-slate-500 focus:border-orange-400"
        />
        <button type="submit" disabled={!quickAddr.trim()} className={`${btnPrimary} px-6 py-3 text-sm`}>{t("wl_quick_btn")}</button>
      </form>
      {quickFromDemo && !quickMsg && quickAddr && (
        <p className="mt-2 text-xs text-emerald-300">✨ {t("wl_quick_from_demo")}</p>
      )}
      {quickMsg && (
        <p role="alert" className={`mt-2 rounded-lg border px-3 py-2 text-xs ${quickMsg.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"}`}>{quickMsg.text}</p>
      )}
      <p className="mt-4 text-xs font-semibold text-slate-400">{t("wl_quick_or")}</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <a href="#chain-cards" className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 transition hover:border-orange-400/50">
          <p className="text-lg">🦊</p>
          <p className="mt-1 text-sm font-semibold text-white">{t("wl_start_1t")}</p>
          <p className="mt-0.5 text-xs text-slate-400">{t("wl_start_1d")}</p>
        </a>
        <a href="#manual-address-section" className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 transition hover:border-orange-400/50">
          <p className="text-lg">📋</p>
          <p className="mt-1 text-sm font-semibold text-white">{t("wl_start_2t")}</p>
          <p className="mt-0.5 text-xs text-slate-400">{t("wl_start_2d")}</p>
        </a>
        <a href="#manual-crypto-section" className="rounded-xl border border-slate-700 bg-slate-900/60 p-4 transition hover:border-orange-400/50">
          <p className="text-lg">✍️</p>
          <p className="mt-1 text-sm font-semibold text-white">{t("wl_start_3t")}</p>
          <p className="mt-0.5 text-xs text-slate-400">{t("wl_start_3d")}</p>
        </a>
      </div>
    </div>
  );
}
