"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { buildPortfolioSummaryText } from "@/lib/portfolio/summaryText";
import { loadNickname } from "@/lib/user/nickname";
import { escapeHtml } from "@/lib/utils/html";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  ts?: number;
};

type ChatWidgetProps = {
  withContainer?: boolean;
  messagesMaxHeightClassName?: string;
  title?: string;
  subtitle?: string;
  assistantLabel?: string;
  assistantAvatar?: string;
  inputClassName?: string;
  placeholder?: string;
  isPro?: boolean;
};

const STORAGE_KEY = "owlfund.chat.messages.v2";
const FREE_CHAT_LIMIT = 5;

function getChatMonthKey() {
  const d = new Date();
  return `owlfund.chat.count.${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function getChatCount(): number {
  try { return parseInt(localStorage.getItem(getChatMonthKey()) ?? "0", 10) || 0; }
  catch { return 0; }
}
function incrementChatCount() {
  try { localStorage.setItem(getChatMonthKey(), String(getChatCount() + 1)); }
  catch { /* ignore */ }
}

function formatTime(ts: number): string {
  try { return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

// Renderiza texto com **bold**, *italic* e listas
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const isBullet = /^[-•*]\s/.test(line);
    const content = escapeHtml(line.replace(/^[-•*]\s/, ""))
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/`(.+?)`/g, "<code class=\"bg-slate-800 px-1 rounded text-orange-300 text-xs\">$1</code>");
    return (
      <span key={i} className={`block ${isBullet ? "pl-3 before:content-['•'] before:mr-2 before:text-orange-400" : ""} ${i > 0 && !isBullet ? "mt-1.5" : ""}`}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  });
}

export default function ChatWidget({
  withContainer = true,
  messagesMaxHeightClassName = "max-h-56",
  title = "Chat IA",
  subtitle = "Pergunta sobre o mercado e a plataforma.",
  assistantAvatar = "/chain-icon.jpg",
  inputClassName = "",
  placeholder = "Escreve a tua pergunta...",
  isPro = false,
}: ChatWidgetProps) {
  const { t } = useLanguage();
  const pathname = usePathname();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chatCount, setChatCount] = useState(0);
  const [nick, setNick] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChatCount(getChatCount());
    setNick(loadNickname() || "");
  }, []);

  // Carregar histórico do localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ChatMessage[];
      if (Array.isArray(parsed)) {
        setMessages(parsed.filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string"));
      }
    } catch { /* ignore */ }
  }, []);

  // Guardar histórico
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40))); }
    catch { /* ignore */ }
  }, [messages]);

  // Auto-scroll para a última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const PAGE_SUG: Record<string, string[]> = {
    "/dashboard":   [t("cw_d1"), t("cw_d2"), t("cw_d3")],
    "/portfolio":   [t("cw_p1"), t("cw_p2"), t("cw_p3")],
    "/wallets":     [t("cw_w1"), t("cw_w2"), t("cw_w3")],
    "/smart-money": [t("cw_sm1"), t("cw_sm2"), t("cw_sm3")],
    "/mercado":     [t("cw_m1"), t("cw_m2"), t("cw_m3")],
    "/fiscalidade": [t("cw_fi1"), t("cw_fi2"), t("cw_fi3")],
    "/fire":        [t("cw_fr1"), t("cw_fr2"), t("cw_fr3")],
    "/account":     [t("cw_a1"), t("cw_a2"), t("cw_a3")],
  };
  const suggestions = PAGE_SUG[pathname ?? ""] ?? [t("cw_d1"), t("cw_def2"), t("cw_def3")];

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    // Verificar limite mensal para utilizadores Free
    if (!isPro && chatCount >= FREE_CHAT_LIMIT) {
      setError(`Atingiste o limite de ${FREE_CHAT_LIMIT} chats/mês do plano Gratuito. Faz upgrade para Pro para chats ilimitados.`);
      return;
    }

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed, ts: Date.now() }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      // Resumo do portfolio completo (on-chain + CEX + DeFi + manuais + stablecoins
      // + tradicional) para o assistente conhecer os ativos reais do utilizador.
      let portfolio: string | null = null;
      try {
        portfolio = await buildPortfolioSummaryText();
      } catch {
        portfolio = null;
      }

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 25000);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          pageContext: pathname ?? undefined,
          portfolio: portfolio ?? undefined,
          nickname: loadNickname() || undefined,
        }),
        signal: controller.signal,
      }).finally(() => window.clearTimeout(timeoutId));

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Falha ao contactar a IA.");
      }

      const data = (await response.json()) as { reply?: string };
      const reply = typeof data.reply === "string" ? data.reply : "";
      if (!reply) throw new Error("Resposta vazia da IA.");

      setMessages(prev => [...prev, { role: "assistant", content: reply, ts: Date.now() }]);
      if (!isPro) {
        incrementChatCount();
        setChatCount(getChatCount());
      }
    } catch (err) {
      const msg = err instanceof DOMException && err.name === "AbortError"
        ? "Timeout — tenta novamente."
        : err instanceof Error ? err.message : "Erro inesperado.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const clearHistory = () => {
    setMessages([]);
    setError(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  };

  const limitReached = !isPro && chatCount >= FREE_CHAT_LIMIT;

  const content = (
    <div className="flex flex-col gap-3">
      {/* Header (só em modo standalone; dentro do FloatingChat o painel já tem cabeçalho) */}
      {withContainer && (
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">{title}</p>
            <p className="text-sm text-slate-400">{subtitle}</p>
          </div>
        </div>
      )}

      {/* Barra de ações */}
      {messages.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={clearHistory}
            className="flex items-center gap-1 rounded-full border border-slate-800 px-2.5 py-1 text-[10px] text-slate-500 transition hover:border-slate-600 hover:text-slate-300"
            title={t("cw_clear_btn")}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            </svg>
            {t("cw_clear_btn")}
          </button>
        </div>
      )}

      {/* Mensagens */}
      <div className={`${messagesMaxHeightClassName} space-y-3 overflow-y-auto pr-1 scroll-smooth`}>
        {messages.length === 0 ? (
          /* Estado de boas-vindas */
          <div className="flex flex-col items-center gap-4 px-1 py-2 text-center">
            <div className="relative animate-fade-in-up">
              <img src={assistantAvatar} alt="" className="h-16 w-16 rounded-2xl border border-slate-700 object-cover shadow-lg shadow-black/40" />
              <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-slate-950 bg-emerald-400" />
            </div>
            <div className="animate-fade-in-up delay-100">
              <p className="text-base font-bold text-white">
                {t("cw_greeting_hi")}{nick ? ` ${nick}` : ""}! 👋
              </p>
              <p className="mt-1 text-xs text-slate-400">{t("cw_greeting_intro")}</p>
            </div>
            <div className="w-full space-y-2 pt-1">
              <p className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("cw_suggestions")}</p>
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => sendMessage(s)}
                  className={`group flex w-full items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-left text-xs text-slate-300 transition hover:border-orange-500/40 hover:bg-slate-800/60 hover:text-white animate-fade-in-up delay-${Math.min(i * 100 + 100, 400)}`}
                >
                  <span className="text-sm">💬</span>
                  <span className="flex-1">{s}</span>
                  <span className="text-slate-600 transition group-hover:translate-x-0.5 group-hover:text-orange-400">→</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className={`flex items-end gap-2 animate-fade-in-up ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
              {/* Avatar */}
              {msg.role === "assistant" ? (
                <img src={assistantAvatar} alt="" className="h-7 w-7 flex-shrink-0 rounded-full border border-slate-700 object-cover" />
              ) : (
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-orange-500/30 bg-orange-500/15 text-[10px] font-bold text-orange-300">
                  {nick ? nick[0].toUpperCase() : "🙂"}
                </span>
              )}
              {/* Bolha */}
              <div className={`flex max-w-[80%] flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div className={`px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "rounded-2xl rounded-br-md border border-orange-500/25 bg-orange-500/15 text-slate-100"
                    : "rounded-2xl rounded-bl-md border border-slate-700/50 bg-slate-800/70 text-slate-200"
                }`}>
                  <div className="space-y-0.5">{renderMarkdown(msg.content)}</div>
                </div>
                {msg.ts ? <span className="mt-0.5 px-1 text-[9px] text-slate-600">{formatTime(msg.ts)}</span> : null}
              </div>
            </div>
          ))
        )}

        {/* Indicador de "a escrever" */}
        {isLoading && (
          <div className="flex items-end gap-2 animate-fade-in-up">
            <img src={assistantAvatar} alt="" className="h-7 w-7 flex-shrink-0 rounded-full border border-slate-700 object-cover" />
            <div className="rounded-2xl rounded-bl-md border border-slate-700/50 bg-slate-800/70 px-4 py-3">
              <div className="flex items-center gap-1">
                {[0, 1, 2].map(n => (
                  <span key={n} className="h-1.5 w-1.5 rounded-full bg-orange-400" style={{ animation: `bounce 1.2s ease-in-out ${n * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {limitReached ? (
          <div className="space-y-1 rounded-xl border border-orange-500/30 bg-orange-500/5 px-3 py-3 text-xs">
            <p className="font-semibold text-orange-300">🔒 Limite de {FREE_CHAT_LIMIT} chats/mês atingido</p>
            <p className="text-slate-400">Faz upgrade para Pro e tem chats ilimitados.</p>
            <a href="/pricing" className="mt-1 inline-block rounded-full bg-orange-500 px-4 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-orange-400">
              Upgrade para Pro →
            </a>
          </div>
        ) : (
          <>
            {!isPro && messages.length > 0 && (
              <p className="text-right text-[10px] text-slate-600">
                Chats este mês: <span className={chatCount >= FREE_CHAT_LIMIT - 1 ? "text-amber-400" : "text-slate-500"}>{chatCount}/{FREE_CHAT_LIMIT}</span>
              </p>
            )}
            {error && (
              <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>
            )}
          </>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-slate-800/60 pt-3">
        <input
          className={`flex-1 rounded-full border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-200 outline-none transition focus:border-orange-400 placeholder:text-slate-600 ${inputClassName}`}
          placeholder={placeholder}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading || limitReached}
          maxLength={1000}
        />
        <button
          type="button"
          aria-label={t("cw_send_aria")}
          title={t("cw_send_aria")}
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-500 text-slate-950 transition hover:scale-105 hover:bg-orange-400 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim() || limitReached}
        >
          {isLoading ? (
            <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );

  if (!withContainer) return content;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
      {content}
    </div>
  );
}
