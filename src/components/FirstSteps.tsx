"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";
import { ACCOUNTS_EVENT, accKey, getActiveAccountId } from "@/lib/portfolios/accounts";
import { loadTrades } from "@/lib/portfolios/trades";
import { loadWalletSnapshot } from "@/lib/wallets/storage";
import { loadCryptoHoldings, loadStablecoinEntries } from "@/lib/crypto/storage";
import { loadTraditionalHoldings } from "@/lib/traditional/storage";

// "Primeiros passos" no dashboard de uma conta nova.
//
// Existe porque a primeira tester real entrou uma vez, viu um dashboard
// vazio, e nunca mais voltou. Um dashboard sem dados nao diz o que fazer;
// isto diz — por ordem, com o porque de cada passo, e com o caminho ja aberto.
//
// Tres passos ficam feitos sozinhos quando os dados aparecem (carteira,
// ativo manual, transacao). Dois sao de descoberta (Fiscalidade, assistente)
// e ficam feitos ao clicar. Quando estao os cinco, o cartao agradece e
// desaparece; tambem se pode esconder a mao. Estado por conta, no browser.

type StepId = "wallet" | "manual" | "trade" | "tax" | "chat";
type Step = { id: StepId; icon: string; title: TranslationKey; why: TranslationKey; cta: TranslationKey; href?: string; auto: boolean };

const STEPS: Step[] = [
  { id: "wallet", icon: "🔗", title: "fs_s1_t", why: "fs_s1_d", cta: "fs_s1_cta", href: "/wallets", auto: true },
  { id: "manual", icon: "🪙", title: "fs_s2_t", why: "fs_s2_d", cta: "fs_s2_cta", href: "/wallets#manual-crypto-section", auto: true },
  { id: "trade", icon: "🧾", title: "fs_s3_t", why: "fs_s3_d", cta: "fs_s3_cta", href: "/historico", auto: true },
  { id: "tax", icon: "🧮", title: "fs_s4_t", why: "fs_s4_d", cta: "fs_s4_cta", href: "/fiscalidade", auto: false },
  { id: "chat", icon: "💬", title: "fs_s5_t", why: "fs_s5_d", cta: "fs_s5_cta", auto: false },
];

const KEY = "first-steps-v1";
type Saved = { hidden?: boolean; clicked?: StepId[]; celebrated?: boolean };

function readSaved(): Saved {
  try { return JSON.parse(localStorage.getItem(accKey(KEY, getActiveAccountId())) ?? "{}") as Saved; } catch { return {}; }
}
function writeSaved(s: Saved) {
  try { localStorage.setItem(accKey(KEY, getActiveAccountId()), JSON.stringify(s)); } catch { /* modo privado */ }
}

// O que ja existe na conta — lido do mesmo sitio que as paginas leem.
function detectAuto(): Record<"wallet" | "manual" | "trade", boolean> {
  try {
    const snap = loadWalletSnapshot();
    const wallet = (snap.eth?.length ?? 0) + (snap.sol?.length ?? 0) + (snap.btc?.length ?? 0) + (snap.ada?.length ?? 0) + (snap.other?.length ?? 0) > 0 || (snap.cexUsd ?? 0) > 0;
    const manual = Object.keys(loadCryptoHoldings()).length > 0 || Object.keys(loadTraditionalHoldings()).length > 0 || loadStablecoinEntries().length > 0;
    const trade = loadTrades().length > 0;
    return { wallet, manual, trade };
  } catch { return { wallet: false, manual: false, trade: false }; }
}

export default function FirstSteps() {
  const { t } = useLanguage();
  const [saved, setSaved] = useState<Saved | null>(null);
  const [auto, setAuto] = useState<Record<"wallet" | "manual" | "trade", boolean> | null>(null);
  // O cartao de "tudo a postos" fecha com uma saida curta em vez de sumir.
  const [closing, setClosing] = useState(false);
  // Pré-visualização sem mexer nos dados: /dashboard?fs=done mostra o cartao
  // final (para rever o aspeto); "Fechar" so o tira do ecra.
  const [demoDone, setDemoDone] = useState(false);

  const refresh = useCallback(() => { setSaved(readSaved()); setAuto(detectAuto()); }, []);
  useEffect(() => {
    try { setDemoDone(new URLSearchParams(window.location.search).get("fs") === "done"); } catch { /* sem window */ }
    refresh();
    window.addEventListener(ACCOUNTS_EVENT, refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener(ACCOUNTS_EVENT, refresh); window.removeEventListener("focus", refresh); };
  }, [refresh]);

  const done = (s: Step) => !saved || !auto ? false : s.auto ? auto[s.id as "wallet" | "manual" | "trade"] : (saved.clicked ?? []).includes(s.id);
  const doneCount = STEPS.filter(done).length;
  const allDone = !!saved && !!auto && doneCount === STEPS.length;
  // Marca "celebrado" quando os cinco ficam feitos (fora do render): a proxima
  // visita ja nao mostra nada.
  const celebrated = saved?.celebrated === true;
  useEffect(() => {
    if (allDone && saved && !celebrated) writeSaved({ ...saved, celebrated: true });
  }, [allDone, celebrated, saved]);

  if (!demoDone && (!saved || !auto || saved.hidden)) return null;

  const markClicked = (id: StepId) => {
    if (!saved) return;
    const next = { ...saved, clicked: Array.from(new Set([...(saved.clicked ?? []), id])) };
    writeSaved(next); setSaved(next);
  };
  const hide = () => {
    if (demoDone) { setDemoDone(false); setClosing(false); return; }
    if (!saved) return;
    const next = { ...saved, hidden: true }; writeSaved(next); setSaved(next);
  };
  const closeSoft = () => { setClosing(true); window.setTimeout(hide, 150); };

  if (allDone || demoDone) {
    // Agradece uma vez; na proxima visita (ja "celebrado") desaparece.
    if (celebrated && !demoDone) return null;
    return (
      <section className={`${closing ? "animate-fade-out" : "animate-scale-in"} rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-5`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {/* O check desenha-se — acontece uma vez por conta */}
            <span className="success-check flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30" aria-hidden="true">
              <svg viewBox="0 0 48 48" width="28" height="28" fill="none" stroke="#020617" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 25l7 7 13-14" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-bold text-white">{t("fs_done_t")}</p>
              <p className="mt-1 text-xs text-slate-400">{t("fs_done_d")}</p>
            </div>
          </div>
          <button type="button" onClick={closeSoft} className="shrink-0 rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:text-white">{t("fs_close")}</button>
        </div>
      </section>
    );
  }

  const next = STEPS.find((s) => !done(s));

  return (
    <section className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/[0.08] to-slate-900/60 p-5" aria-labelledby="fs-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">{t("fs_kicker")}</p>
          <h2 id="fs-title" className="mt-1 text-lg font-bold text-white">{t("fs_title")}</h2>
          <p className="mt-1 text-xs text-slate-400">{t("fs_subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-slate-400">{t("fs_progress").replace("{done}", String(doneCount)).replace("{total}", String(STEPS.length))}</p>
            <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full rounded-full bg-orange-400 transition-[width] duration-300" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
            </div>
          </div>
          <button type="button" onClick={hide} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-slate-300" title={t("fs_hide_help")}>{t("fs_hide")}</button>
        </div>
      </div>

      <ol className="mt-4 grid gap-2 md:grid-cols-5">
        {STEPS.map((s, i) => {
          const isDone = done(s);
          const isNext = next?.id === s.id;
          const inner = (
            <>
              <div className="flex items-center gap-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isDone ? "bg-emerald-500 text-slate-950" : isNext ? "bg-orange-400 text-slate-950" : "bg-slate-800 text-slate-400"}`}>{isDone ? "✓" : i + 1}</span>
                <span className="text-base">{s.icon}</span>
              </div>
              <p className={`mt-2 text-sm font-semibold ${isDone ? "text-slate-400 line-through decoration-slate-600" : "text-white"}`}>{t(s.title)}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{t(s.why)}</p>
              {!isDone && <span className={`mt-2 inline-block text-xs font-semibold ${isNext ? "text-orange-300" : "text-slate-300"}`}>{t(s.cta)} →</span>}
            </>
          );
          const cls = `block h-full rounded-xl border p-3 text-left transition ${isDone ? "border-emerald-500/30 bg-emerald-500/[0.05]" : isNext ? "border-orange-400/60 bg-orange-500/10 shadow-lg shadow-orange-500/10 hover:bg-orange-500/15" : "border-slate-800 bg-slate-950/40 hover:border-slate-600"}`;
          return (
            <li key={s.id}>
              {s.href ? (
                <a href={s.href} onClick={() => { if (!s.auto) markClicked(s.id); }} className={cls} aria-current={isNext ? "step" : undefined}>{inner}</a>
              ) : (
                <button type="button" onClick={() => { markClicked(s.id); window.dispatchEvent(new CustomEvent("chainfolio:open-chat")); }} className={`${cls} w-full`} aria-current={isNext ? "step" : undefined}>{inner}</button>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-[11px] text-slate-500">🔒 {t("fs_safe")}</p>
    </section>
  );
}
