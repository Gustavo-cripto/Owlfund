"use client";

import ErrorNote from "@/components/ErrorNote";
import { btnPrimary } from "@/lib/ui/buttons";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// Caixa de confirmacao da pagina de carteiras (desligar carteira, etc.).
// Extraido de src/app/(pt)/wallets/page.tsx (fase 1): quem abre/fecha e o que
// confirma continua na pagina.
type Props = {
  title?: string;
  description?: string;
  error: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmacaoModal({ title, description, error, busy, onCancel, onConfirm }: Props) {
  const { t } = useLanguage();
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-950/95 p-6 text-slate-100 shadow-2xl">
        <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
          {title ?? t("wl_confirm")}
        </p>
        <p className="mt-3 text-sm text-slate-300">
          {description ?? t("wl_confirm_op")}
        </p>
        {error ? (
          <ErrorNote className="mt-3">{error}</ErrorNote>
        ) : null}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            onClick={onCancel}
          >
            {t("wl_cancel")}
          </button>
          <button
            type="button"
            className={`${btnPrimary} px-4 py-2 text-xs disabled:opacity-60`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "…" : t("wl_confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
