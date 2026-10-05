"use client";

// Faixa do modo de exemplo (ver src/lib/demo/exemplo.ts): aparece em todas as
// páginas da app enquanto a conta ativa tiver carteiras de exemplo.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { ACCOUNTS_EVENT } from "@/lib/portfolios/accounts";
import { EVENTO_EXEMPLO, exemploAtivo, removerExemplo } from "@/lib/demo/exemplo";

export default function ExemploBanner() {
  const { t } = useLanguage();
  const [ativo, setAtivo] = useState(false);
  useEffect(() => {
    const ler = () => setAtivo(exemploAtivo());
    ler();
    window.addEventListener(EVENTO_EXEMPLO, ler);
    window.addEventListener(ACCOUNTS_EVENT, ler);
    window.addEventListener("storage", ler);
    return () => { window.removeEventListener(EVENTO_EXEMPLO, ler); window.removeEventListener(ACCOUNTS_EVENT, ler); window.removeEventListener("storage", ler); };
  }, []);
  if (!ativo) return null;
  return (
    <div className="mb-4 flex flex-col gap-2 rounded-xl border border-sky-500/30 bg-sky-500/[0.07] px-4 py-3 text-xs text-sky-100 sm:flex-row sm:items-center sm:justify-between">
      <p className="leading-relaxed">🧪 {t("ex_banner")}</p>
      <div className="flex shrink-0 gap-2">
        <Link href="/wallets" className="rounded-lg bg-sky-500 px-3 py-1.5 font-semibold text-slate-950 hover:bg-sky-400">{t("ex_connect")}</Link>
        <button type="button" onClick={() => { removerExemplo(); window.location.reload(); }} className="rounded-lg border border-sky-400/40 px-3 py-1.5 text-sky-200 hover:border-sky-300 hover:text-white">{t("ex_remove")}</button>
      </div>
    </div>
  );
}
