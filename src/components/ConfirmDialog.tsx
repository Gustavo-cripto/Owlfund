"use client";

// Diálogo de confirmação próprio (substitui window.confirm): traduzível,
// com o visual do site, foco no botão seguro e Escape para cancelar.
// Uso: const askConfirm = useConfirm(); if (!(await askConfirm({ message }))) return;
// Fora do provider cai no window.confirm nativo (nunca bloqueia a ação).

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Sheet from "@/components/ui/Sheet";
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
  if (ctx) return ctx;
  // Sem provider acima, a confirmação cai no window.confirm nativo: sem
  // tradução, sem o visual do site, e a BLOQUEAR o browser enquanto está
  // aberta. Nunca deve acontecer — o provider está no RootShell, acima de
  // tudo. Se acontecer, é um erro de montagem e diz-se alto, em vez de se
  // degradar em silêncio (foi assim que passou despercebido).
  if (process.env.NODE_ENV !== "production") {
    console.error("[useConfirm] sem ConfirmProvider acima — a usar window.confirm. Ver src/components/RootShell.tsx.");
  }
  return async (opts) => {
    const message = typeof opts === "string" ? opts : opts.message;
    return typeof window !== "undefined" ? window.confirm(message) : false;
  };
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  // Um só estado, com o "aberto" lá dentro: assim cada fecho produz um objeto
  // NOVO e o React volta sempre a desenhar. Antes eram dois estados e o updater
  // devolvia o mesmo objeto — o React saltava a actualização e a folha ficava
  // pendurada. E o resolver vive numa referência: chamar-lhe de dentro de um
  // updater é um efeito secundário onde não pode haver nenhum (o React pode
  // correr o updater mais do que uma vez).
  const [pedido, setPedido] = useState<{ opts: ConfirmOptions; aberto: boolean } | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    const o = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      resolver.current?.(false);          // um pedido novo cancela o anterior
      resolver.current = resolve;
      setPedido({ opts: o, aberto: true });
    });
  }, []);

  const close = useCallback((v: boolean) => {
    resolver.current?.(v);
    resolver.current = null;
    setPedido((p) => (p ? { ...p, aberto: false } : null));
  }, []);

  const sair = useCallback(() => setPedido(null), []);

  useEffect(() => { if (pedido?.aberto) cancelRef.current?.focus(); }, [pedido?.aberto]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pedido && (
        <Sheet aberto={pedido.aberto} aoFechar={() => close(false)} aoSair={sair} rotuladoPor="cf-confirm-title">
          <div className="p-6 pt-4 sm:pt-6">
            <h3 id="cf-confirm-title" className={`text-sm font-bold ${pedido.opts.danger ? "text-rose-300" : "text-white"}`}>
              {pedido.opts.title ?? (pedido.opts.danger ? `⚠️ ${t("ac_confirm")}` : t("ac_confirm"))}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300 whitespace-pre-line">{pedido.opts.message}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button ref={cancelRef} type="button" onClick={() => close(false)}
                className="press rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60">
                {pedido.opts.cancelLabel ?? t("cancel")}
              </button>
              <button type="button" onClick={() => close(true)}
                className={`press rounded-xl px-4 py-2 text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60 ${pedido.opts.danger ? "bg-rose-500/90 text-white hover:bg-rose-500" : "bg-orange-500 text-slate-950 hover:bg-orange-400"}`}>
                {pedido.opts.okLabel ?? t("ac_confirm")}
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </ConfirmContext.Provider>
  );
}
