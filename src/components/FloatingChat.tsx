"use client";

import { useEffect, useState, useTransition } from "react";
import ChatWidget from "@/components/ChatWidget";

const STORAGE_KEY_OPEN = "owlfund.floatingChat.open.v1";

export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [isContentReady, setIsContentReady] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_OPEN);
      if (raw === "1") setIsOpen(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_OPEN, isOpen ? "1" : "0");
    } catch {
      // ignore
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setIsContentReady(false);
      return;
    }
    const timeoutId = window.setTimeout(() => setIsContentReady(true), 60);
    return () => window.clearTimeout(timeoutId);
  }, [isOpen]);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {isOpen ? (
        <div className="pointer-events-auto relative w-[90vw] max-w-[440px] overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/85 shadow-2xl backdrop-blur">
          {/* background image (watermark) */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.22]"
            style={{
              backgroundImage: "url(/chain-bg.jpg)",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              backgroundSize: "cover",
              filter: "blur(1px)",
            }}
            aria-hidden
          />
          {/* subtle dark overlay for contrast */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/40 via-slate-950/60 to-slate-950/80" aria-hidden />

          <div className="relative flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-700 bg-slate-900/40">
                <img
                  src="/chain-icon.jpg"
                  alt="Chain"
                  className="h-full w-full object-cover"
                />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold text-white">Chain</p>
                <p className="truncate text-xs text-slate-400">
                  Pergunta sobre cripto, notícias e níveis técnicos.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => startTransition(() => setIsOpen(false))}
              className="rounded-full border border-slate-700 bg-slate-900/40 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              aria-label="Fechar chat"
              title="Fechar"
            >
              ✕
            </button>
          </div>

          <div className="relative min-h-[420px] p-5 pb-6">
            <img
              src="/chain-icon.jpg"
              alt="Chain"
              className="pointer-events-none absolute right-5 top-3 h-28 w-28 rounded-full border-2 border-orange-400/80 object-cover shadow-[0_0_30px_rgba(251,146,60,0.45)] ring-4 ring-orange-300/20"
            />
            <div className="pt-36">
              {isContentReady ? (
                <ChatWidget
                  withContainer={false}
                  title="Chat"
                  subtitle="Respostas em PT, sem aconselhamento financeiro direto."
                  assistantLabel="Chain"
                  messagesMaxHeightClassName="max-h-[70vh]"
                  inputClassName="py-3 text-base"
                  buttonClassName="px-7 py-3 text-base"
                />
              ) : (
                <div className="h-[220px]" aria-hidden />
              )}
            </div>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => startTransition(() => setIsOpen(true))}
        className="pointer-events-auto group relative flex items-center gap-3 rounded-full border border-slate-700 bg-slate-950/85 px-6 py-4 text-sm font-semibold text-slate-100 shadow-2xl transition hover:scale-[1.02] hover:border-slate-500 hover:bg-slate-950 active:scale-[0.98]"
        aria-label="Abrir chat"
        title="Abrir chat"
      >
        <span className="pointer-events-none absolute -inset-1 rounded-full bg-orange-500/10 opacity-0 blur transition group-hover:opacity-100" />
        <span className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-slate-950 shadow-lg ring-1 ring-orange-200/20 transition group-hover:brightness-110">
          <img
            src="/chain-icon.jpg"
            alt=""
            className="h-full w-full object-cover opacity-95"
          />
        </span>
        <span className="hidden sm:inline">Chat</span>
      </button>
    </div>
  );
}

