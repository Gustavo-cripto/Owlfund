"use client";

import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY_OPEN = "owlfund.characterai.open.v1";

export default function CharacterAiFloatingChat() {
  // Aceita os dois nomes para evitar confusão na Vercel.
  const url =
    process.env.NEXT_PUBLIC_CHARACTER_AI_URL ??
    process.env.NEXT_PUBLIC_CHARACTER_AI_URL ??
    "";

  const [isOpen, setIsOpen] = useState(false);
  const [tryEmbed, setTryEmbed] = useState(false);
  const [mountIframe, setMountIframe] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);

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
      setMountIframe(false);
      setIframeLoaded(false);
      setTryEmbed(false);
      return;
    }

    // Só tenta montar iframe quando o utilizador pede.
    if (!tryEmbed) return;
    const t1 = window.setTimeout(() => setMountIframe(true), 50);
    return () => window.clearTimeout(t1);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (!tryEmbed) {
      setMountIframe(false);
      setIframeLoaded(false);
      return;
    }
    const t1 = window.setTimeout(() => setMountIframe(true), 50);
    return () => window.clearTimeout(t1);
  }, [isOpen, tryEmbed]);

  const safeUrl = useMemo(() => {
    const trimmed = url.trim();
    if (!trimmed) return "";
    if (!/^https?:\/\//i.test(trimmed)) return "";
    return trimmed;
  }, [url]);

  // If not configured, don't render anything.
  if (!safeUrl) return null;

  const openExternal = () => {
    try {
      window.open(safeUrl, "_blank", "noopener,noreferrer");
    } catch {
      window.location.href = safeUrl;
    }
  };

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

          <div className="relative bg-slate-950/40">
            {!tryEmbed ? (
              <div className="p-5">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <p className="text-sm font-semibold text-white">Abrir o chat</p>
                  <p className="mt-1 text-xs text-slate-400">
                    O Character.AI normalmente <span className="font-semibold text-slate-200">não permite</span> abrir dentro do site (iframe).
                    O mais estável é abrir numa nova aba/janela.
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={openExternal}
                      className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-400"
                    >
                      Abrir chat agora
                    </button>
                    <button
                      type="button"
                      onClick={() => setTryEmbed(true)}
                      className="rounded-full border border-slate-700 bg-slate-900/40 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                    >
                      Tentar embed (beta)
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {!mountIframe ? (
                  <div className="h-[62vh] min-h-[520px] w-full animate-pulse bg-slate-950/40" />
                ) : (
                  <iframe
                    title="Character.AI agent"
                    src={safeUrl}
                    className="h-[62vh] min-h-[520px] w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onLoad={() => setIframeLoaded(true)}
                    // Nota: Character.AI pode bloquear iframe via X-Frame-Options/CSP.
                  />
                )}
                {!iframeLoaded ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 p-4">
                    <div className="pointer-events-auto rounded-2xl border border-slate-800 bg-slate-950/90 p-4 text-sm text-slate-200 shadow-xl backdrop-blur">
                      <p className="font-semibold text-white">Se ficar em branco, usa “Abrir”.</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Se o embed estiver bloqueado, abre numa nova aba para funcionar sempre.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={openExternal}
                          className="pointer-events-auto rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-orange-400"
                        >
                          Abrir chat
                        </button>
                        <button
                          type="button"
                          onClick={() => setTryEmbed(false)}
                          className="pointer-events-auto rounded-full border border-slate-700 bg-slate-900/40 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                        >
                          Voltar
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="pointer-events-auto group relative flex items-center gap-3 rounded-full border border-slate-700 bg-slate-950/85 px-5 py-4 text-sm font-semibold text-slate-100 shadow-2xl transition hover:scale-[1.02] hover:border-slate-500 hover:bg-slate-950 active:scale-[0.98]"
        aria-label="Abrir chat do agente"
        title="Abrir chat"
      >
        {/* pulse ring */}
        <span className="pointer-events-none absolute -inset-1 rounded-full bg-orange-500/10 opacity-0 blur transition group-hover:opacity-100" />

        <span className="relative grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-slate-950 shadow-lg ring-1 ring-orange-200/20 transition group-hover:brightness-110">
          <span className="text-lg leading-none">💬</span>
        </span>
        <span className="hidden sm:inline">Agente</span>
      </button>
    </div>
  );
}

