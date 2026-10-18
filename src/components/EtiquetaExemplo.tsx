"use client";

// Selo "EXEMPLO" ao lado dos totais enquanto a conta tem o exemplo carregado:
// quem acabou de criar conta via milhões no total e achava que eram seus
// (dono, 18 out 2026).
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useExemploAtivo } from "@/lib/demo/useExemploAtivo";

export default function EtiquetaExemplo({ className = "" }: { className?: string }) {
  const { t } = useLanguage();
  if (!useExemploAtivo()) return null;
  return (
    <span title={t("ex_badge_tip")} className={`inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/15 px-2 py-0.5 align-middle text-[11px] font-bold uppercase tracking-wider text-amber-200 ${className}`}>
      🧪 {t("ex_badge")}
    </span>
  );
}
