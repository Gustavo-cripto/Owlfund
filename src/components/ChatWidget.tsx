"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type ChatWidgetProps = {
  withContainer?: boolean;
  messagesMaxHeightClassName?: string;
  title?: string;
  subtitle?: string;
  assistantLabel?: string;
  inputClassName?: string;
  buttonClassName?: string;
  placeholder?: string;
};

const STORAGE_KEY = "owlfund.chat.messages.v2";

// Sugestões por página
const PAGE_SUGGESTIONS: Record<string, string[]> = {
  "/dashboard":    ["Como funciona o Owlfund?", "Como adiciono uma carteira?", "O que é o PNL?"],
  "/portfolio":    ["Explica o meu Score de portfólio", "O que é o Sharpe Ratio?", "Como guardar um snapshot?"],
  "/wallets":      ["Como conecto o MetaMask?", "O que é o WalletConnect?", "A carteira é segura?"],
  "/smart-money":  ["O que é Smart Money?", "Quem é o Vitalik?", "Como interpretar movimentos de baleias?"],
  "/mercado":      ["O que está a mexer com o BTC hoje?", "Explica o RSI", "O que é market cap?"],
  "/fiscalidade":  ["Como funciona o FIFO?", "Quando pago impostos em Portugal?", "O que é mais-valia cripto?"],
  "/fire":         ["O que é a regra dos 4%?", "Como calcular o meu número FIRE?", "O que é CAGR?"],
  "/account":      ["Como funciona o plano Pro?", "Como cancelar a subscrição?", "O que inclui o plano gratuito?"],
};

const DEFAULT_SUGGESTIONS = [
  "Como funciona o Owlfund?",
  "O que está a mexer com o BTC?",
  "Como adiciono uma carteira cripto?",
];

// Renderiza texto com **bold**, *italic* e listas
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const isBullet = /^[-•*]\s/.test(line);
    const content = line
      .replace(/^[-•*]\s/, "")
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
  assistantLabel = "Chain",
  inputClassName = "",
  buttonClassName = "",
  placeholder = "Escreve a tua pergunta...",
}: ChatWidgetProps) {
  const pathname = usePathname();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  const suggestions = PAGE_SUGGESTIONS[pathname ?? ""] ?? DEFAULT_SUGGESTIONS;

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 25000);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          pageContext: pathname ?? undefined,
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

      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
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

  const content = (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">{title}</p>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="text-[10px] text-slate-600 hover:text-slate-400 transition"
            title="Limpar conversa"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Messages */}
      <div className={`${messagesMaxHeightClassName} space-y-2.5 overflow-y-auto pr-1 scroll-smooth`}>
        {messages.length === 0 ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">Sugestões:</p>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => sendMessage(s)}
                className="block w-full rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-left text-xs text-slate-300 transition hover:border-orange-500/30 hover:text-white hover:bg-slate-800/60"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "ml-8 bg-orange-500/15 text-slate-100 border border-orange-500/20"
                  : "mr-4 bg-slate-800/60 text-slate-200 border border-slate-700/50"
              }`}
            >
              <span className="mb-1 block text-[9px] uppercase tracking-[0.25em] text-slate-500">
                {msg.role === "user" ? "Tu" : assistantLabel}
              </span>
              <div className="space-y-0.5">
                {renderMarkdown(msg.content)}
              </div>
            </div>
          ))
        )}

        {/* Typing indicator */}
        {isLoading && (
          <div className="mr-4 rounded-2xl border border-slate-700/50 bg-slate-800/60 px-3.5 py-3">
            <span className="mb-1 block text-[9px] uppercase tracking-[0.25em] text-slate-500">{assistantLabel}</span>
            <div className="flex items-center gap-1 pt-0.5">
              {[0, 1, 2].map(n => (
                <span
                  key={n}
                  className="h-1.5 w-1.5 rounded-full bg-orange-400"
                  style={{ animation: `bounce 1.2s ease-in-out ${n * 0.2}s infinite` }}
                />
              ))}
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{error}</p>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          className={`flex-1 rounded-full border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-200 outline-none transition focus:border-orange-400 placeholder:text-slate-600 ${inputClassName}`}
          placeholder={placeholder}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
          maxLength={1000}
        />
        <button
          type="button"
          className={`flex-shrink-0 rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60 ${buttonClassName}`}
          onClick={() => sendMessage(input)}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? "..." : "Enviar"}
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
