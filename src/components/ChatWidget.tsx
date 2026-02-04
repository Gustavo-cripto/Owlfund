"use client";

import { useState } from "react";
 
 type ChatMessage = {
   role: "user" | "assistant";
   content: string;
 };
 
 type ChatWidgetProps = {
   /** Renderiza o “card” externo com borda/padding (default: true). */
   withContainer?: boolean;
   /** Classe para controlar altura do scroll das mensagens. */
   messagesMaxHeightClassName?: string;
   /** Texto do cabeçalho. */
   title?: string;
   subtitle?: string;
   /** Nome mostrado nas mensagens do assistente. */
   assistantLabel?: string;
  /** Classes opcionais para aumentar o input/botão quando usado no balão. */
  inputClassName?: string;
  buttonClassName?: string;
  placeholder?: string;
 };
 
 export default function ChatWidget({
   withContainer = true,
   messagesMaxHeightClassName = "max-h-56",
   title = "Chat IA",
   subtitle = "Pergunta sobre o mercado e receba insights em PT.",
   assistantLabel = "Gust_Crypto",
  inputClassName = "",
  buttonClassName = "",
  placeholder = "Escreve a tua pergunta...",
 }: ChatWidgetProps) {
   const [messages, setMessages] = useState<ChatMessage[]>([]);
   const [input, setInput] = useState("");
   const [isLoading, setIsLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
 
   const handleSend = async () => {
     const trimmed = input.trim();
     if (!trimmed || isLoading) return;
 
     const nextMessages: ChatMessage[] = [
       ...messages,
       { role: "user", content: trimmed },
     ];
 
     setMessages(nextMessages);
     setInput("");
     setError(null);
     setIsLoading(true);
 
     try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 20000);
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages }),
        signal: controller.signal,
      }).finally(() => window.clearTimeout(timeoutId));
 
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string; provider?: string }
          | null;
        if (payload?.provider) setProvider(payload.provider);
        throw new Error(payload?.error ?? "Falha ao conectar com a IA.");
      }
 
      const data = (await response.json()) as { reply?: string; provider?: string };
       const reply = typeof data.reply === "string" ? data.reply : "";
       if (!reply) {
         throw new Error("Resposta vazia da IA.");
       }
      if (typeof data.provider === "string" && data.provider) {
        setProvider(data.provider);
      }
 
       setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
     } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "O pedido demorou demasiado (timeout)."
          : err instanceof Error
            ? err.message
            : "Erro inesperado.";
      setError(message);
     } finally {
       setIsLoading(false);
     }
   };
 
  const content = (
    <>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">{title}</p>
          <p className="text-sm text-slate-400">{subtitle}</p>
          {provider ? (
            <p className="mt-1 text-xs text-slate-500">
              Provider: <span className="font-semibold text-slate-300">{provider}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className={`${messagesMaxHeightClassName} space-y-3 overflow-y-auto pr-2`}>
          {messages.length === 0 ? (
            <p className="text-sm text-slate-500">
              Exemplo: "O que está a mexer com o BTC hoje?"
            </p>
          ) : (
            messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={
                  message.role === "user"
                    ? "rounded-xl bg-slate-900/80 p-3 text-sm text-slate-100"
                    : "rounded-xl border border-orange-500/20 bg-slate-900/60 p-3 text-sm text-slate-200"
                }
              >
                <span className="block text-[11px] uppercase tracking-[0.25em] text-slate-500">
                  {message.role === "user" ? "Você" : assistantLabel}
                </span>
                <p className="mt-1 whitespace-pre-wrap">{message.content}</p>
              </div>
            ))
          )}
        </div>

        {error ? <p className="text-sm text-rose-300">{error}</p> : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className={`flex-1 rounded-full border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-200 outline-none transition focus:border-orange-400 ${inputClassName}`}
            placeholder={placeholder}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
          />
          <button
            type="button"
            className={`rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60 ${buttonClassName}`}
            onClick={handleSend}
            disabled={isLoading}
          >
            {isLoading ? "A enviar..." : "Enviar"}
          </button>
        </div>
      </div>
    </>
  );

  if (!withContainer) return content;

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
      {content}
    </div>
  );
 }
