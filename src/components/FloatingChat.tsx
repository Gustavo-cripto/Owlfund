"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import ChatWidget from "@/components/ChatWidget";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const STORAGE_KEY_OPEN = "owlfund.floatingChat.open.v1";
const STORAGE_KEY_SEEN = "owlfund.floatingChat.seen.v1";

export default function FloatingChat() {
  const { t } = useLanguage();
  const pathname = usePathname();
  const supabase = createClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isContentReady, setIsContentReady] = useState(false);
  const [showBadge, setShowBadge] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [, startTransition] = useTransition();

  // Verificar sessão + plano (o chat só existe para utilizadores autenticados)
  useEffect(() => {
    const check = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoggedIn(false); setIsPro(false); return; }
      setIsLoggedIn(true);
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("status, current_period_end")
        .eq("user_id", user.id)
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle();
      const active = sub?.status === "active" || sub?.status === "trialing";
      const notExpired = !sub?.current_period_end || new Date(sub.current_period_end).getTime() > Date.now();
      setIsPro(active && notExpired);
    };
    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => { check(); });
    return () => subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    try {
      const wasOpen = localStorage.getItem(STORAGE_KEY_OPEN) === "1";
      const hasSeen = localStorage.getItem(STORAGE_KEY_SEEN) === "1";
      if (wasOpen) setIsOpen(true);
      if (!hasSeen) {
        // Mostra badge de "novo" após 3 segundos para utilizadores que nunca abriram
        const t = window.setTimeout(() => setShowBadge(true), 3000);
        return () => window.clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY_OPEN, isOpen ? "1" : "0"); }
    catch { /* ignore */ }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) { setIsContentReady(false); return; }
    setShowBadge(false);
    try { localStorage.setItem(STORAGE_KEY_SEEN, "1"); } catch { /* ignore */ }
    const t = window.setTimeout(() => setIsContentReady(true), 80);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  // Permite abrir o chat a partir de outros pontos (ex.: botão de Suporte nas definições)
  useEffect(() => {
    const open = () => setIsOpen(true);
    window.addEventListener("chainfolio:open-chat", open);
    return () => window.removeEventListener("chainfolio:open-chat", open);
  }, []);

  // Fechar ao navegar em mobile (viewport < 640px)
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 640) {
      setIsOpen(false);
    }
  }, [pathname]);

  const pageLabels: Record<string, string> = {
    "/dashboard":   t("nav_dashboard"),
    "/portfolio":   t("nav_portfolio"),
    "/wallets":     t("nav_wallets"),
    "/smart-money": t("nav_smart_money"),
    "/mercado":     t("nav_mercado"),
    "/fiscalidade": t("fch_taxes"),
    "/fire":        "FIRE",
    "/account":     t("nav_account"),
  };
  const currentPage = pageLabels[pathname ?? ""] ?? null;

  // Sem sessão iniciada (páginas públicas / visitantes), o chat não é renderizado
  if (!isLoggedIn) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">

      {/* Chat panel */}
      {isOpen && (
        <div
          className="keep-dark pointer-events-auto relative w-[92vw] max-w-[460px] overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-950/92 shadow-2xl shadow-black/50 backdrop-blur"
          style={{ animation: "chat-pop 0.25s ease both" }}
        >
          {/* Background decorativo */}
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.18]"
            style={{ backgroundImage: "url(/chain-bg.jpg)", backgroundSize: "cover", backgroundPosition: "center", filter: "blur(1.5px)" }}
            aria-hidden
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-slate-950/50 via-slate-950/65 to-slate-950/85" aria-hidden />

          {/* Header */}
          <div className="relative flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-10 w-10 flex-shrink-0">
                <img src="/chain-icon.jpg" alt="Chain" className="h-10 w-10 rounded-full object-cover border border-slate-700" />
                <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-slate-950" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-white leading-tight">Chain</p>
                <p className="text-[11px] text-slate-400 leading-tight">
                  {currentPage ? `${t("fch_youre_on")}: ${currentPage}` : t("fch_status_default")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => startTransition(() => setIsOpen(false))}
              className="rounded-full border border-slate-700 bg-slate-900/60 p-1.5 text-slate-400 transition hover:border-slate-500 hover:text-white"
              aria-label={t("fch_close")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Chain image + chat */}
          <div className="relative p-4 pb-5">
            {/* Avatar grande só quando não há mensagens */}
            {isContentReady && (
              <ChatWidget
                withContainer={false}
                title="CHAIN"
                subtitle="ChainFolioAI · Mercados cripto · Análise técnica"
                assistantLabel="Chain"
                messagesMaxHeightClassName="max-h-[52vh]"
                inputClassName="py-2.5 text-sm"
                placeholder={t("fch_placeholder")}
                isPro={isPro}
              />
            )}
            {!isContentReady && <div className="h-64 flex items-center justify-center"><span className="text-sm text-slate-500 animate-pulse">{t("fch_loading")}</span></div>}
          </div>
        </div>
      )}

      {/* Botão flutuante */}
      <button
        type="button"
        onClick={() => startTransition(() => setIsOpen(prev => !prev))}
        className="keep-dark pointer-events-auto group relative flex items-center gap-3 rounded-full border border-slate-700 bg-slate-950/90 px-5 py-3 text-sm font-semibold text-slate-100 shadow-2xl shadow-black/40 transition hover:scale-[1.03] hover:border-slate-500 hover:bg-slate-950 active:scale-[0.97]"
        aria-label={isOpen ? t("fch_minimize") : t("fch_open")}
      >
        {/* Glow hover */}
        <span className="pointer-events-none absolute -inset-1 rounded-full bg-orange-500/8 opacity-0 blur transition group-hover:opacity-100" />

        {/* Avatar */}
        <span className="relative flex-shrink-0">
          <img src="/chain-icon.jpg" alt="" className="h-10 w-10 rounded-full object-cover border border-slate-700 group-hover:brightness-110 transition" />
          {/* Badge de online */}
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-400 border-2 border-slate-950" />
        </span>

        <span className="hidden sm:inline">{t("fch_chat")}</span>

        {/* Badge "novo" pulsante */}
        {showBadge && !isOpen && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center">
            <span className="absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" style={{ animation: "ping-dot 1.2s cubic-bezier(0,0,0.2,1) infinite" }} />
            <span className="relative h-2.5 w-2.5 rounded-full bg-orange-500" />
          </span>
        )}
      </button>
    </div>
  );
}
