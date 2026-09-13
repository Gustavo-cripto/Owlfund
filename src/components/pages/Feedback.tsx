"use client";

import { useEffect, useState } from "react";
import { btnPrimary } from "@/lib/ui/buttons";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

// Uma pergunta, um passo, sem login. Chega-se aqui pelo link do email a quem
// desistiu; o email vem pre-preenchido em ?e= para sabermos quem respondeu,
// mas e opcional — pode apagar-se.
const REASONS: Array<{ key: string; label: TranslationKey }> = [
  { key: "next_step", label: "fb_r_next_step" },
  { key: "exchange", label: "fb_r_exchange" },
  { key: "load", label: "fb_r_load" },
  { key: "worth", label: "fb_r_worth" },
  { key: "other_product", label: "fb_r_other_product" },
  { key: "other", label: "fb_r_other" },
];

export default function Feedback() {
  const { t, lang } = useLanguage();
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [text, setText] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");

  useEffect(() => {
    try { const e = new URLSearchParams(window.location.search).get("e"); if (e) setEmail(e); } catch { /* ignore */ }
  }, []);

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!reason && !text.trim()) return;
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, reason, text, lang, website }),
      });
      setState(res.ok ? "ok" : "error");
    } catch { setState("error"); }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-16">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">ChainFolioAI</p>
        <h1 className="mt-3 text-3xl font-bold text-white">{t("fb_title")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">{t("fb_intro")}</p>

        {state === "ok" ? (
          <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6">
            <p className="text-lg font-bold text-white">{t("fb_thanks_title")}</p>
            <p className="mt-2 text-sm text-slate-300">{t("fb_thanks_body")}</p>
            <a href="/" className={`${btnPrimary} mt-5 inline-flex px-5 py-2.5 text-sm`}>{t("fb_back")}</a>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-5">
            <div className="absolute -left-[9999px] top-0" aria-hidden><label>Website<input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {REASONS.map((r) => (
                <button key={r.key} type="button" onClick={() => setReason(r.key)} aria-pressed={reason === r.key}
                  className={`rounded-xl border px-4 py-3 text-left text-sm transition ${reason === r.key ? "border-orange-400 bg-orange-500/15 text-white" : "border-slate-700 bg-slate-900/60 text-slate-300 hover:border-slate-500"}`}>
                  {t(r.label)}
                </button>
              ))}
            </div>
            <div>
              <label htmlFor="fb-text" className="mb-1.5 block text-xs uppercase tracking-wider text-slate-500">{t("fb_text_label")}</label>
              <textarea id="fb-text" value={text} onChange={(e) => setText(e.target.value)} rows={4} maxLength={1000} placeholder={t("fb_text_ph")}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:border-orange-500 focus:outline-none" />
            </div>
            <div>
              <label htmlFor="fb-email" className="mb-1.5 block text-xs uppercase tracking-wider text-slate-500">{t("fb_email_label")}</label>
              <input id="fb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white focus:border-orange-500 focus:outline-none" />
            </div>
            {state === "error" && <p className="text-sm text-rose-300">{t("fb_error")}</p>}
            <button type="submit" disabled={state === "sending" || (!reason && !text.trim())} className={`${btnPrimary} w-full px-6 py-3 text-sm disabled:opacity-50`}>
              {state === "sending" ? t("fb_sending") : t("fb_send")}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
