"use client";

import { useEffect, useState } from "react";
import ChatWidget from "@/components/ChatWidget";

const STORAGE_KEY_OPEN = "owlfund.floatingChat.open.v1";

export default function FloatingChat() {
  const [isOpen, setIsOpen] = useState(false);

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

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {isOpen ? (
        <div className="pointer-events-auto w-[92vw] max-w-[440px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/85 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">Gust_Crypto</p>
              <p className="truncate text-xs text-slate-500">
                Pergunta sobre cripto, notícias e níveis técnicos.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              aria-label="Fechar chat"
              title="Fechar"
            >
              ✕
            </button>
          </div>

          <div className="p-4">
            <ChatWidget
              withContainer={false}
              title="Chat"
              subtitle="Respostas em PT, sem aconselhamento financeiro direto."
              assistantLabel="Gust_Crypto"
              messagesMaxHeightClassName="max-h-[45vh]"
            />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="pointer-events-auto group relative flex items-center gap-3 rounded-full border border-slate-700 bg-slate-950/85 px-5 py-4 text-sm font-semibold text-slate-100 shadow-2xl transition hover:scale-[1.02] hover:border-slate-500 hover:bg-slate-950 active:scale-[0.98]"
        aria-label="Abrir chat"
        title="Abrir chat"
      >
        <span className="pointer-events-none absolute -inset-1 rounded-full bg-orange-500/10 opacity-0 blur transition group-hover:opacity-100" />
        <span className="relative grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-slate-950 shadow-lg ring-1 ring-orange-200/20 transition group-hover:brightness-110">
          <span className="text-lg leading-none">💬</span>
        </span>
        <span className="hidden sm:inline">Chat</span>
      </button>
    </div>
  );
}

