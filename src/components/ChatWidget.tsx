"use client";

import { useState } from "react";
 
 type ChatMessage = {
   role: "user" | "assistant";
   content: string;
 };
 
 export default function ChatWidget() {
   const [messages, setMessages] = useState<ChatMessage[]>([]);
   const [input, setInput] = useState("");
   const [isLoading, setIsLoading] = useState(false);
   const [error, setError] = useState<string | null>(null);
 
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
       const response = await fetch("/api/chat", {
         method: "POST",
         headers: { "Content-Type": "application/json" },
         body: JSON.stringify({ messages: nextMessages }),
       });
 
       if (!response.ok) {
         const payload = await response.json().catch(() => null);
         throw new Error(payload?.error ?? "Falha ao conectar com a IA.");
       }
 
       const data = (await response.json()) as { reply?: string };
       if (!data.reply) {
         throw new Error("Resposta vazia da IA.");
       }
 
       setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
     } catch (err) {
       setError(err instanceof Error ? err.message : "Erro inesperado.");
     } finally {
       setIsLoading(false);
     }
   };
 
   return (
     <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5">
       <div className="flex items-center justify-between">
         <div>
           <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
             Chat IA
           </p>
           <p className="text-sm text-slate-400">
             Pergunta sobre o mercado e receba insights em PT-BR.
           </p>
         </div>
       </div>
 
       <div className="mt-4 space-y-3">
         <div className="max-h-56 space-y-3 overflow-y-auto pr-2">
           {messages.length === 0 ? (
             <p className="text-sm text-slate-500">
               Exemplo: "O que impacta o preço do BTC hoje?"
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
                   {message.role === "user" ? "Você" : "Owlfund IA"}
                 </span>
                 <p className="mt-1 whitespace-pre-wrap">{message.content}</p>
               </div>
             ))
           )}
         </div>
 
         {error ? <p className="text-sm text-rose-300">{error}</p> : null}
 
         <div className="flex flex-col gap-2 sm:flex-row">
           <input
             className="flex-1 rounded-full border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-200 outline-none transition focus:border-orange-400"
             placeholder="Escreve a tua pergunta..."
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
             className="rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
             onClick={handleSend}
             disabled={isLoading}
           >
             {isLoading ? "A enviar..." : "Enviar"}
           </button>
         </div>
       </div>
     </div>
   );
 }
