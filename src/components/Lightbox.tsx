"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// Imagem clicavel que abre em grande, por cima de tudo. Para os screenshots
// das paginas publicas: a miniatura numa coluna de 500 px nao deixa ler os
// numeros, e e isso que quem esta a decidir quer ver.
//
// Sem biblioteca: um botao a volta da imagem, um portal com a mesma imagem ao
// tamanho do ecra, e fecha com Esc, com o X ou a clicar fora. O scroll da
// pagina fica preso enquanto esta aberta.
type Props = {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  loading?: "lazy" | "eager";
  onLoad?: () => void;
  onError?: () => void;
};

export default function Lightbox({ src, alt, width, height, className, loading = "lazy", onLoad, onError }: Props) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`${alt} — ${t("lb_open")}`}
        title={t("lb_open")}
        className="group relative block w-full cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
      >
        <img src={src} alt={alt} width={width} height={height} loading={loading} decoding="async" onLoad={onLoad} onError={onError} className={className} />
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-slate-950/80 px-2.5 py-1 text-[11px] font-semibold text-slate-200 opacity-0 ring-1 ring-slate-700 transition group-hover:opacity-100 group-focus-visible:opacity-100">
          ⤢ {t("lb_open")}
        </span>
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={close}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-sm animate-fade-in"
        >
          <button
            type="button"
            onClick={close}
            aria-label={t("lb_close")}
            className="absolute right-4 top-4 rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-slate-200 ring-1 ring-slate-700 hover:bg-slate-800"
          >
            ✕ {t("lb_close")}
          </button>
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            onClick={(e) => e.stopPropagation()}
            className="animate-scale-in max-h-[92vh] max-w-[96vw] rounded-xl border border-slate-800 object-contain shadow-2xl shadow-black/60"
          />
          <p className="pointer-events-none absolute bottom-4 left-0 right-0 text-center text-xs text-slate-500">{alt}</p>
        </div>,
        document.body,
      )}
    </>
  );
}
