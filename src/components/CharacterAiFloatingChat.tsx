"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY_OPEN = "owlfund.characterai.open.v1";

export default function CharacterAiFloatingChat() {
  const url = process.env.NEXT_PUBLIC_CHARACTER_AI_URL ?? "";

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

  const safeUrl = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed) return "";
    if (!/^https?:\/\//i.test(trimmed)) return "";
    return trimmed;
  }, [url]);

  // If not configured, don't render anything.
  if (!safeUrl) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {isOpen ? (
        <div className="pointer-events-auto w-[92vw] max-w-[420px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-950/80 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">Agente (Character.AI)</p>
              <p className="truncate text-xs text-slate-500">
                Se o embed falhar, usa “Abrir”.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={safeUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                title="Abrir em nova aba"
              >
                Abrir
              </a>
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
          </div>

          <div className="bg-slate-950/40">
            <iframe
              title="Character.AI agent"
              src={safeUrl}
              className="h-[62vh] min-h-[520px] w-full border-0"
              loading="lazy"
              referrerPolicy="no-referrer"
              // Nota: Character.AI pode bloquear iframe via X-Frame-Options/CSP.
            />
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="pointer-events-auto flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/85 px-4 py-3 text-sm font-semibold text-slate-100 shadow-xl transition hover:border-slate-500 hover:bg-slate-950"
        aria-label="Abrir chat do agente"
        title="Abrir chat"
      >
        <span className="grid h-8 w-8 place-items-center rounded-full bg-orange-500 text-slate-950">
          💬
        </span>
        <span className="hidden sm:inline">Agente</span>
      </button>
    </div>
  );
}

