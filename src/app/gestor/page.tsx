"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { createClient } from "@/lib/supabase/client";
import { loadWalletSnapshot } from "@/lib/wallets/storage";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type PlanStatus = "loading" | "premium" | "not-premium";

const QUICK_ACTIONS = [
  { icon: "📊", label: "Análise de portfolio", prompt: "Analisa o meu portfolio atual — risco, alocação e recomendações." },
  { icon: "🧾", label: "Impostos PT 2024", prompt: "Qual a minha exposição fiscal estimada em Portugal para 2024?" },
  { icon: "📡", label: "Smart Money RT", prompt: "Há movimentos relevantes de baleias na minha watchlist hoje?" },
  { icon: "🔥", label: "Plano FIRE", prompt: "Simula o meu plano FIRE com base no portfolio atual." },
  { icon: "⚖️", label: "Rebalancear", prompt: "Recomenda uma estratégia de rebalanceamento para este mês." },
  { icon: "📄", label: "Relatório fiscal", prompt: "Gera um resumo do relatório fiscal 2024 para exportação." },
  { icon: "🐋", label: "Análise on-chain", prompt: "Analisa os movimentos on-chain das minhas carteiras." },
  { icon: "📈", label: "Benchmark", prompt: "Como está o meu portfolio a performar vs BTC, ETH e S&P500?" },
];

function formatMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, '<p style="font-size:13px;font-weight:500;margin:10px 0 4px">$1</p>')
    .replace(/^## (.+)$/gm, '<p style="font-size:14px;font-weight:500;margin:12px 0 4px">$1</p>')
    .replace(/^# (.+)$/gm, '<p style="font-size:15px;font-weight:500;margin:14px 0 4px">$1</p>')
    .replace(/^- (.+)$/gm, '<li style="margin:3px 0;padding-left:4px">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, (m) => `<ul style="margin:6px 0;padding-left:16px;list-style:disc">${m}</ul>`)
    .replace(/\n\n/g, '<br style="display:block;margin:4px 0">')
    .replace(/\n/g, "<br>");
}

export default function GestorPage() {
  useRequireAuth();
  const supabase = createClient();

  const [planStatus, setPlanStatus] = useState<PlanStatus>("loading");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [portfolioSummary, setPortfolioSummary] = useState<{ total: string; btc: string; eth: string; sol: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Check Premium plan
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/subscription");
        if (res.ok) {
          const json = await res.json() as { plan: string };
          setPlanStatus(json.plan === "premium" ? "premium" : "not-premium");
        } else {
          setPlanStatus("not-premium");
        }
      } catch {
        setPlanStatus("not-premium");
      }
    };
    check();
  }, []);

  // Load portfolio summary from localStorage
  useEffect(() => {
    const snap = loadWalletSnapshot();
    const btc = (snap.btc ?? []).reduce((s, e) => s + parseFloat(e.balance ?? "0"), 0);
    const eth = (snap.eth ?? []).reduce((s, e) => s + parseFloat(e.balance ?? "0"), 0);
    const sol = (snap.sol ?? []).reduce((s, e) => s + parseFloat(e.balance ?? "0"), 0);
    if (btc || eth || sol) {
      setPortfolioSummary({
        total: "—",
        btc: btc.toFixed(4),
        eth: eth.toFixed(4),
        sol: sol.toFixed(2),
      });
    }
  }, []);

  // Welcome message
  useEffect(() => {
    if (planStatus === "premium") {
      setMessages([{
        id: "welcome",
        role: "assistant",
        content: "Olá! Sou o teu **Gestor Dedicado IA**. Tenho acesso ao teu portfolio, histórico on-chain e watchlist de baleias em tempo real.\n\nComo posso ajudar-te hoje? Usa as sugestões rápidas ou escreve diretamente.",
        timestamp: new Date(),
      }]);
    }
  }, [planStatus]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: trimmed, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    if (textareaRef.current) { textareaRef.current.style.height = ""; }

    try {
      const history = [...messages, userMsg].slice(-14).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/gestor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? "Erro desconhecido.");
      }

      const data = await res.json() as { reply: string };
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.reply,
        timestamp: new Date(),
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: `Erro ao processar pedido: ${err instanceof Error ? err.message : "Tenta novamente."}`,
        timestamp: new Date(),
      }]);
    } finally {
      setLoading(false);
    }
  }, [messages, loading]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  // ── Not premium gate ─────────────────────────────────────────────────────────
  if (planStatus === "not-premium") {
    return (
      <AppShell>
        <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mx-auto text-3xl">🤖</div>
            <div>
              <h1 className="text-2xl font-bold text-white">Gestor Dedicado IA</h1>
              <p className="text-slate-400 mt-2 text-sm leading-relaxed">O teu gestor financeiro pessoal com IA, com acesso ao teu portfolio completo, análise fiscal e smart money em tempo real.</p>
            </div>
            <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5 text-left space-y-3">
              {["Análise de risco e alocação do portfolio","Estimativas fiscais IRS Portugal","Planeamento FIRE personalizado","Smart Money e movimentos de baleias","Estratégias de rebalanceamento","Relatórios exportáveis"].map(f => (
                <div key={f} className="flex items-center gap-2 text-sm text-slate-200">
                  <span className="text-violet-400 text-xs">✓</span>{f}
                </div>
              ))}
            </div>
            <a href="/pricing" className="block w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold text-white hover:bg-violet-400 transition text-center">
              Upgrade para Premium — €39/mês
            </a>
          </div>
        </div>
      </AppShell>
    );
  }

  if (planStatus === "loading") {
    return (
      <AppShell>
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
        </div>
      </AppShell>
    );
  }

  // ── Premium UI ───────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 flex flex-col">
        {/* Header */}
        <div className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-lg">🤖</div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">Gestor Dedicado IA</p>
            <p className="text-xs text-slate-400">Owlfund Premium · acesso completo ao portfolio</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-semibold">Online</span>
          </div>
          <span className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-2 py-0.5 font-semibold">Premium</span>
        </div>

        <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 128px)" }}>
          {/* Sidebar */}
          <div className="w-64 border-r border-slate-800 flex flex-col overflow-y-auto bg-slate-950 hidden lg:flex">
            {/* Portfolio mini-card */}
            {portfolioSummary && (
              <div className="m-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Portfolio</p>
                <div className="space-y-1">
                  {portfolioSummary.btc !== "0.0000" && <div className="flex justify-between text-xs"><span className="text-slate-400">BTC</span><span className="text-slate-200">{portfolioSummary.btc}</span></div>}
                  {portfolioSummary.eth !== "0.0000" && <div className="flex justify-between text-xs"><span className="text-slate-400">ETH</span><span className="text-slate-200">{portfolioSummary.eth}</span></div>}
                  {portfolioSummary.sol !== "0.00" && <div className="flex justify-between text-xs"><span className="text-slate-400">SOL</span><span className="text-slate-200">{portfolioSummary.sol}</span></div>}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="px-3 pt-2 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Sugestões rápidas</p>
              <div className="space-y-1">
                {QUICK_ACTIONS.map(a => (
                  <button key={a.label} type="button"
                    onClick={() => sendMessage(a.prompt)}
                    className="w-full text-left rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition flex items-center gap-2">
                    <span>{a.icon}</span>{a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-auto p-3 border-t border-slate-800">
              <button type="button" onClick={() => setMessages([{
                id: "welcome-reset",
                role: "assistant",
                content: "Conversa reiniciada. Como posso ajudar?",
                timestamp: new Date(),
              }])} className="w-full text-xs text-slate-500 hover:text-slate-300 transition py-1">
                🗑 Limpar conversa
              </button>
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Mobile quick actions */}
            <div className="lg:hidden flex gap-2 overflow-x-auto px-4 py-2 border-b border-slate-800 no-scrollbar">
              {QUICK_ACTIONS.slice(0, 4).map(a => (
                <button key={a.label} type="button"
                  onClick={() => sendMessage(a.prompt)}
                  className="flex-shrink-0 rounded-full border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-violet-500/50 hover:text-violet-300 transition whitespace-nowrap">
                  {a.icon} {a.label}
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm ${
                    msg.role === "assistant"
                      ? "bg-violet-500/20 border border-violet-500/30 text-lg"
                      : "bg-slate-800 border border-slate-700 text-xs text-slate-400"
                  }`}>
                    {msg.role === "assistant" ? "🤖" : "👤"}
                  </div>
                  <div className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-violet-600 text-white rounded-tr-sm"
                      : "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm"
                  }`}>
                    {msg.role === "assistant"
                      ? <div dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
                      : msg.content
                    }
                    <p className="text-[10px] mt-1.5 opacity-50">
                      {msg.timestamp.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {loading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-violet-500/20 border border-violet-500/30 text-lg">🤖</div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1 items-center h-5">
                      {[0, 0.2, 0.4].map(d => (
                        <span key={d} className="w-1.5 h-1.5 rounded-full bg-slate-500"
                          style={{ animation: `bounce 1.2s ${d}s infinite` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-slate-800 p-4 bg-slate-950">
              <div className="flex gap-3 items-end max-w-3xl mx-auto">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => { setInput(e.target.value); autoResize(e.target); }}
                  onKeyDown={handleKeyDown}
                  placeholder="Pergunta algo ao teu gestor... (Enter para enviar)"
                  rows={1}
                  disabled={loading}
                  className="flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/20 disabled:opacity-50 transition"
                  style={{ minHeight: "46px", maxHeight: "120px" }}
                />
                <button
                  type="button"
                  onClick={() => sendMessage(input)}
                  disabled={loading || !input.trim()}
                  className="w-11 h-11 rounded-xl bg-violet-600 flex items-center justify-center text-white hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition flex-shrink-0"
                  aria-label="Enviar"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
              <p className="text-center text-[10px] text-slate-600 mt-2">IA com acesso ao teu portfolio · Não constitui aconselhamento financeiro</p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes bounce { 0%,80%,100%{transform:translateY(0);opacity:.3} 40%{transform:translateY(-4px);opacity:1} }
        .no-scrollbar::-webkit-scrollbar{display:none}
        .no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
      `}</style>
    </AppShell>
  );
}
