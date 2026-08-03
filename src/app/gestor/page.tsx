"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";
import { buildPortfolioSummary, type PortfolioCategory } from "@/lib/portfolio/summaryText";
import { loadNickname } from "@/lib/user/nickname";
import {
  ACCOUNTS_EVENT,
  ALL_ACCOUNTS_ID,
  accKey,
  getActiveAccountId,
  listAccounts,
} from "@/lib/portfolios/accounts";
import { escapeHtml } from "@/lib/utils/html";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import type { TranslationKey } from "@/lib/i18n/translations";

type WatchEntry = { address: string; label: string; chain: "eth" | "sol" | "btc" };

function loadWatchlist(): WatchEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("smart-money-watchlist");
    return raw ? (JSON.parse(raw) as WatchEntry[]) : [];
  } catch { return []; }
}

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type PlanStatus = "loading" | "premium" | "not-premium";

// Persistência da conversa POR CONTA (cada portfólio tem a sua thread com o
// Gestor). accKey prefixa por conta ativa → cf.acct.<id>.<base>.
const GESTOR_MESSAGES_BASE = "gestor.chat.messages.v1";
const gestorKeyFor = (accountId: string) => accKey(GESTOR_MESSAGES_BASE, accountId);

function activeAccountName(accountId: string): string {
  if (accountId === ALL_ACCOUNTS_ID) return "Todas as contas";
  return listAccounts().find((a) => a.id === accountId)?.name ?? "Conta";
}

// (de)serialização — Date vira string no JSON; reconstruir ao ler.
function serializeMessages(msgs: Message[]): string {
  return JSON.stringify(msgs.slice(-40).map(m => ({ ...m, timestamp: m.timestamp.toISOString() })));
}
function readMessages(accountId: string): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(gestorKeyFor(accountId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Array<Omit<Message, "timestamp"> & { timestamp: string }>;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: new Date(m.timestamp) }));
  } catch { return []; }
}

function getQuickActions(t: (k: TranslationKey) => string) {
  const year = new Date().getFullYear();
  const month = new Date().toLocaleString(undefined, { month: "long" });
  return [
    { icon: "📊", label: t("gz_qa_portfolio_l"), prompt: t("gz_qa_portfolio_p") },
    { icon: "🧾", label: `${t("gz_qa_tax_l")} ${year}`, prompt: `${t("gz_qa_tax_p")} ${year}?` },
    { icon: "📡", label: t("gz_qa_sm_l"), prompt: t("gz_qa_sm_p") },
    { icon: "🔥", label: t("gz_qa_fire_l"), prompt: t("gz_qa_fire_p") },
    { icon: "⚖️", label: t("gz_qa_rebal_l"), prompt: `${t("gz_qa_rebal_p")} ${month} ${year}.` },
    { icon: "📄", label: `${t("gz_qa_report_l")} ${year}`, prompt: t("gz_qa_report_p").replace("{y}", String(year)) },
    { icon: "🐋", label: t("gz_qa_onchain_l"), prompt: t("gz_qa_onchain_p") },
    { icon: "📈", label: t("gz_qa_bench_l"), prompt: t("gz_qa_bench_p") },
  ];
}

function formatMarkdown(text: string): string {
  return escapeHtml(text)
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
  const { t, lang } = useLanguage();
  const { hideBalances } = useCurrencyFormat();

  const [planStatus, setPlanStatus] = useState<PlanStatus>("loading");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [portfolio, setPortfolio] = useState<{ totalEur: number; categories: PortfolioCategory[] } | null>(null);
  const [acctId, setAcctId] = useState<string>("");
  const [acctName, setAcctName] = useState<string>("");
  const [acctCount, setAcctCount] = useState(1);
  const hydratedRef = useRef(false);
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

  // Conta ativa (inicial) + reação a trocas de conta.
  useEffect(() => {
    setAcctId(getActiveAccountId());
    const onAccountsChanged = () => {
      const next = getActiveAccountId();
      setAcctId(prev => (prev === next ? prev : next));
    };
    window.addEventListener(ACCOUNTS_EVENT, onAccountsChanged);
    return () => window.removeEventListener(ACCOUNTS_EVENT, onAccountsChanged);
  }, []);

  // Resumo estruturado do portfólio (total em € + categorias) para o mini-card
  // e a mensagem de boas-vindas. Recarrega ao trocar de conta.
  useEffect(() => {
    let alive = true;
    if (!acctId) return;
    buildPortfolioSummary()
      .then(s => { if (alive) setPortfolio({ totalEur: s.totalEur, categories: s.categories }); })
      .catch(() => { if (alive) setPortfolio(null); });
    return () => { alive = false; };
  }, [acctId]);

  // Mensagem de boas-vindas personalizada (nome + total do portfólio).
  const buildWelcome = useCallback((): Message => {
    const nick = loadNickname() || "";
    const greeting = `${t("gz_hi")}${nick ? `, ${nick}` : ""}!`;
    const body = t("gz_welcome").replace(/^[^!]*!\s*/, "");
    let worth = "";
    if (portfolio && portfolio.totalEur > 0 && !hideBalances) {
      const v = `€ ${portfolio.totalEur.toLocaleString(lang === "en" ? "en-US" : "pt-PT", { maximumFractionDigits: 0 })}`;
      worth = `\n\n${t("gz_pf_worth").replace("{v}", v)}`;
    }
    return { id: "welcome", role: "assistant", content: `${greeting} ${body}${worth}`, timestamp: new Date() };
  }, [t, portfolio, hideBalances, lang]);

  // Carrega a conversa persistida da conta ativa; se vazia, mostra as boas-vindas.
  useEffect(() => {
    if (planStatus !== "premium" || !acctId) return;
    hydratedRef.current = false;
    setAcctName(activeAccountName(acctId));
    try { setAcctCount(listAccounts().length); } catch { /* ignore */ }
    const persisted = readMessages(acctId);
    setMessages(persisted.length > 0 ? persisted : [buildWelcome()]);
    requestAnimationFrame(() => { hydratedRef.current = true; });
    // buildWelcome propositadamente fora das deps: só queremos recarregar ao
    // mudar de conta/plano, não a cada atualização do portfólio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planStatus, acctId]);

  // Se o total do portfólio chegar depois e ainda só estivermos nas boas-vindas,
  // atualiza a mensagem para incluir o valor.
  useEffect(() => {
    setMessages(prev => (prev.length === 1 && prev[0].id === "welcome" ? [buildWelcome()] : prev));
  }, [buildWelcome]);

  // Persiste a conversa na chave da conta ativa (só após hidratar e quando há
  // pelo menos uma mensagem do utilizador — não guarda só as boas-vindas).
  useEffect(() => {
    if (!acctId || !hydratedRef.current) return;
    const hasUserMsg = messages.some(m => m.role === "user");
    try {
      if (hasUserMsg) localStorage.setItem(gestorKeyFor(acctId), serializeMessages(messages));
    } catch { /* ignore */ }
  }, [messages, acctId]);

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
      const watchlist = loadWatchlist();
      let portfolioText: string | null = null;
      let accountEmpty = false;
      try {
        const summary = await buildPortfolioSummary();
        portfolioText = summary.text;
        // Conta ativa genuinamente vazia (não um erro de leitura): sem texto e
        // sem valor. O servidor usa isto para não cair no snapshot global.
        accountEmpty = !summary.text && summary.totalEur <= 0;
      } catch {
        portfolioText = null;
        accountEmpty = false;
      }
      const res = await fetch("/api/gestor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, watchlist, lang, portfolio: portfolioText ?? undefined, nickname: loadNickname() || undefined, accountName: acctName || undefined, accountCount: acctCount, accountEmpty }),
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
  }, [messages, loading, lang, acctName, acctCount]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
  };

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = "";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  // Reinicia a conversa da conta ativa (apaga o histórico persistido + boas-vindas).
  const resetConversation = () => {
    try { if (acctId) localStorage.removeItem(gestorKeyFor(acctId)); } catch { /* ignore */ }
    setMessages([buildWelcome()]);
  };

  // Exporta a conversa atual do Gestor em PDF (texto simples, com quebras).
  const exportPdf = useCallback(async () => {
    const convo = messages.filter(m => m.id !== "welcome" || messages.length === 1);
    if (!convo.length) return;
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    let y = margin;

    doc.setFontSize(15); doc.setFont("helvetica", "bold");
    doc.text("ChainFolioAI — Gestor Dedicado IA", margin, y); y += 7;
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(120);
    const meta = [acctName || "", new Date().toLocaleString()].filter(Boolean).join("  ·  ");
    doc.text(meta, margin, y); y += 8;
    doc.setTextColor(30);

    const stripMd = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/^#+\s*/gm, "").replace(/^- /gm, "• ");
    for (const m of convo) {
      const who = m.role === "user" ? "Utilizador" : "Gestor IA";
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      doc.text(`${who} · ${m.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, margin, y); y += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      const lines = doc.splitTextToSize(stripMd(m.content), pageW - margin * 2) as string[];
      for (const line of lines) {
        if (y > pageH - margin) { doc.addPage(); y = margin; }
        doc.text(line, margin, y); y += 5;
      }
      y += 4;
    }
    // Guardar/partilhar: no telemóvel usa a partilha nativa (Ficheiros/AirDrop
    // para o computador); no computador descarrega direto para Transferências.
    const pdfName = `chainfolio-gestor-${new Date().toISOString().slice(0, 10)}.pdf`;
    const pdfBlob = doc.output("blob");
    const nav = navigator as Navigator & {
      canShare?: (d: { files: File[] }) => boolean;
      share?: (d: { files?: File[]; title?: string }) => Promise<void>;
    };
    const pdfFile = typeof File !== "undefined" ? new File([pdfBlob], pdfName, { type: "application/pdf" }) : null;
    if (pdfFile && nav.canShare && nav.canShare({ files: [pdfFile] }) && nav.share) {
      nav.share({ files: [pdfFile], title: pdfName }).catch(() => doc.save(pdfName));
    } else {
      doc.save(pdfName);
    }
  }, [messages, acctName]);

  // ── Not premium gate ─────────────────────────────────────────────────────────
  if (planStatus === "not-premium") {
    return (
      <AppShell>
        <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center mx-auto text-3xl">🤖</div>
            <div>
              <h1 className="text-2xl font-bold text-white">{t("df_gestor_l")}</h1>
              <p className="text-slate-400 mt-2 text-sm leading-relaxed">{t("gz_upsell_desc")}</p>
            </div>
            <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-5 text-left space-y-3">
              {[t("gz_feat_1"),t("gz_feat_2"),t("gz_feat_3"),t("gz_feat_4"),t("gz_feat_5"),t("gz_feat_6")].map(f => (
                <div key={f} className="flex items-center gap-2 text-sm text-slate-200">
                  <span className="text-violet-400 text-xs">✓</span>{f}
                </div>
              ))}
            </div>
            <a href="/pricing" className="block w-full rounded-xl bg-violet-500 px-4 py-3 text-sm font-bold text-white hover:bg-violet-400 transition text-center">
              {t("gz_upgrade")}
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

  // ── Derivados para a UI Premium ──────────────────────────────────────────────
  const locale = lang === "en" ? "en-US" : lang === "es" ? "es-ES" : lang === "fr" ? "fr-FR" : "pt-PT";
  const fmtEur = (n: number) => `€ ${n.toLocaleString(locale, { maximumFractionDigits: 0 })}`;
  const catLabel = (key: string): string => {
    switch (key) {
      case "onchain": return "On-chain";
      case "cex": return "CEX";
      case "defi": return "DeFi";
      case "manual": return "Manual";
      case "stable": return "Stablecoins";
      case "traditional": return lang === "en" ? "Traditional" : lang === "fr" ? "Traditionnel" : "Tradicional";
      default: return key;
    }
  };
  const showAcctChip = Boolean(acctName) && (acctCount > 1 || acctId === ALL_ACCOUNTS_ID);
  const hasConversation = messages.some(m => m.role === "user");

  // ── Premium UI ───────────────────────────────────────────────────────────────
  return (
    <AppShell>
      <div className="min-h-screen bg-slate-950 flex flex-col">
        {/* Header */}
        <div className="border-b border-slate-800 bg-slate-950 px-6 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-lg">🤖</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-white truncate">{t("df_gestor_l")}</p>
              {showAcctChip && (
                <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
                  </svg>
                  <span className="max-w-[120px] truncate">{acctName}</span>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 truncate">{t("gz_subtitle")}</p>
          </div>
          {hasConversation && (
            <button
              type="button"
              onClick={exportPdf}
              title={t("gz_export")}
              aria-label={t("gz_export")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2 py-1.5 text-xs text-slate-300 transition hover:border-violet-500/50 hover:text-violet-300 sm:px-2.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              <span className="hidden sm:inline">{t("gz_export")}</span>
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-semibold">{t("gz_online")}</span>
          </div>
          <span className="text-[10px] bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded-full px-2 py-0.5 font-semibold">Premium</span>
        </div>

        <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 128px)" }}>
          {/* Sidebar */}
          <div className="w-64 border-r border-slate-800 flex flex-col overflow-y-auto bg-slate-950 hidden lg:flex">
            {/* Portfolio mini-card — total real em € + categorias */}
            {portfolio && portfolio.totalEur > 0 && (
              <div className="m-3 rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{t("gz_portfolio")}</p>
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] text-slate-400">{t("gz_pf_total")}</span>
                  <span className="text-sm font-bold text-white">{hideBalances ? "••••" : fmtEur(portfolio.totalEur)}</span>
                </div>
                {portfolio.categories.length > 0 && (
                  <div className="space-y-1 border-t border-slate-800 pt-1.5">
                    {portfolio.categories.map(c => (
                      <div key={c.key} className="flex justify-between gap-2 text-xs">
                        <span className="text-slate-400 truncate">{catLabel(c.key)}</span>
                        <span className="text-slate-200 shrink-0">{hideBalances ? "••••" : fmtEur(c.eur)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Quick actions */}
            <div className="px-3 pt-2 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">{t("gz_quick")}</p>
              <div className="space-y-1">
                {getQuickActions(t).map(a => (
                  <button key={a.label} type="button"
                    onClick={() => sendMessage(a.prompt)}
                    className="w-full text-left rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition flex items-center gap-2">
                    <span>{a.icon}</span>{a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-auto p-3 border-t border-slate-800 space-y-1">
              {hasConversation && (
                <button type="button" onClick={exportPdf} className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-800 py-1.5 text-xs text-slate-400 transition hover:border-violet-500/50 hover:text-violet-300">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  {t("gz_export")}
                </button>
              )}
              <button type="button" onClick={resetConversation} className="w-full text-xs text-slate-500 hover:text-slate-300 transition py-1">
                {t("gz_clear")}
              </button>
            </div>
          </div>

          {/* Chat area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Mobile quick actions */}
            <div className="lg:hidden flex gap-2 overflow-x-auto px-4 py-2 border-b border-slate-800 no-scrollbar">
              {getQuickActions(t).slice(0, 4).map(a => (
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
                      ? "keep-dark bg-violet-600 text-white rounded-tr-sm"
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
                  placeholder={t("gz_placeholder")}
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
                  aria-label={t("gz_send")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </div>
              <p className="text-center text-[10px] text-slate-600 mt-2">{t("gz_disclaimer")}</p>
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
