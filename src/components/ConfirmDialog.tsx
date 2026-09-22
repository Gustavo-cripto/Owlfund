"use client";

// Diálogo de confirmação próprio (substitui window.confirm): traduzível,
// com o visual do site, foco no botão seguro e Escape para cancelar.
// Uso: const askConfirm = useConfirm(); if (!(await askConfirm({ message }))) return;
// Fora do provider cai no window.confirm nativo (nunca bloqueia a ação).

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export type ConfirmOptions = {
  message: string;
  title?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  return ctx ?? (async (opts) => {
    const message = typeof opts === "string" ? opts : opts.message;
    return typeof window !== "undefined" ? window.confirm(message) : false;
  });
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    const o = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      setState((prev) => {
        prev?.resolve(false); // um pedido novo cancela o anterior
        return { opts: o, resolve };
      });
    });
  }, []);

  const close = useCallback((v: boolean) => {
    setState((prev) => { prev?.resolve(v); return null; });
  }, []);

  useEffect(() => {
    if (!state) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="cf-confirm-title" onClick={() => close(false)}>
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 id="cf-confirm-title" className={`text-sm font-bold ${state.opts.danger ? "text-rose-300" : "text-white"}`}>
              {state.opts.title ?? (state.opts.danger ? `⚠️ ${t("ac_confirm")}` : t("ac_confirm"))}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300 whitespace-pre-line">{state.opts.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button ref={cancelRef} type="button" onClick={() => close(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60">
                {state.opts.cancelLabel ?? t("cancel")}
              </button>
              <button type="button" onClick={() => close(true)}
                className={`rounded-xl px-4 py-2 text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60 ${state.opts.danger ? "bg-rose-500/90 text-white hover:bg-rose-500" : "bg-orange-500 text-slate-950 hover:bg-orange-400"}`}>
                {state.opts.okLabel ?? t("ac_confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
