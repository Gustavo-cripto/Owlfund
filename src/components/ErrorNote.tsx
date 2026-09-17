"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

// Mensagem de erro com forma: icone, fundo, e um abanao curto ao aparecer
// (indica "isto foi rejeitado" sem precisar de ler). Substitui os <p> vermelhos
// soltos que se confundiam com texto normal.
//
//   <ErrorNote className="mt-2">{msg}</ErrorNote>
//   <ErrorNote onRetry={reload}>{msg}</ErrorNote>

type Props = { children: React.ReactNode; className?: string; onRetry?: () => void };

export default function ErrorNote({ children, className = "", onRetry }: Props) {
  const { t } = useLanguage();
  return (
    <div role="alert" className={`error-note flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.07] px-3 py-2 text-xs leading-relaxed text-rose-200 ${className}`}>
      <span aria-hidden="true" className="shrink-0">⚠️</span>
      <span className="min-w-0 flex-1">{children}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="press shrink-0 rounded-md border border-rose-400/30 px-2 py-0.5 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/15">
          {t("err_retry")}
        </button>
      )}
    </div>
  );
}
