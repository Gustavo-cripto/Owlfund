"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// Envolve um grafico com um botao "ver em grande": abre o mesmo conteudo num
// dialogo a ocupar o ecra (Esc, X ou clicar fora fecham). `children` recebe
// `large` para poder desenhar mais alto e com mais detalhe quando esta aberto.
type Props = { title: string; children: (large: boolean) => React.ReactNode; className?: string };

export default function ChartModal({ title, children, className }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    // Teclado: Esc fecha; Tab fica dentro do dialogo; ao fechar o foco volta
    // ao botao que o abriu (senao um leitor de ecra "cai" no topo da pagina).
    const opener = document.activeElement as HTMLElement | null;
    const focusables = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? []);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close(); return; }
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; opener?.focus?.(); };
  }, [open, close]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <button type="button" onClick={() => setOpen(true)} aria-label={`${title} — ${t("lb_open")}`} title={t("lb_open")}
        className="absolute right-0 top-0 z-10 rounded-lg border border-slate-700/60 bg-slate-900/70 px-2 py-1 text-xs text-slate-400 transition hover:border-slate-500 hover:text-white">
        ⤢
      </button>
      {children(false)}
      {open && typeof document !== "undefined" && createPortal(
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} onClick={close}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 p-3 backdrop-blur-sm animate-fade-in sm:p-6">
          <div onClick={(e) => e.stopPropagation()} className="animate-scale-in flex h-[88vh] w-full max-w-5xl flex-col rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl shadow-black/60 sm:p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-base font-bold text-white">{title}</h2>
              <button type="button" onClick={close} aria-label={t("lb_close")}
                className="rounded-full bg-slate-800 px-3 py-1.5 text-sm font-semibold text-slate-200 ring-1 ring-slate-700 hover:bg-slate-700">✕ {t("lb_close")}</button>
            </div>
            <div className="min-h-0 flex-1">{children(true)}</div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
