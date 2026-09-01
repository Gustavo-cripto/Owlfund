"use client";

import { useState } from "react";
import Link from "next/link";
import { btnPrimary } from "@/lib/ui/buttons";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function BetaPage() {
  const { t, lang } = useLanguage();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [err, setErr] = useState("");

  // Beta encerrado a novos testers a partir da data de corte (env).
  const betaClosed = (() => {
    const raw = process.env.NEXT_PUBLIC_BETA_CUTOFF ?? "2026-11-05T23:59:59Z";
    if (!raw) return false;
    const d = new Date(raw);
    return !Number.isNaN(d.getTime()) && Date.now() > d.getTime();
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setErr(t("beta_bad_email"));
      setState("error");
      return;
    }
    setState("sending");
    setErr("");
    try {
      const res = await fetch("/api/beta-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          name: name.trim(),
          note: note.trim(),
          lang,
          // Origem do link (?src=twitter etc.) para atribuição por rede.
          src: (() => {
            try {
              return new URLSearchParams(window.location.search).get("src") ?? "";
            } catch { return ""; }
          })(),
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error === "beta_closed" ? t("beta_closed_body") : j?.error || t("beta_err"));
      }
      setState("ok");
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : t("beta_err"));
      setState("error");
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-32 left-1/2 h-[420px] w-[720px] -translate-x-1/2 rounded-full bg-orange-500/10 blur-[120px]" />
      </div>
      <main className="relative mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center px-6 py-16">
        <Link href="/" className="mb-8 text-sm text-orange-300/90 transition hover:text-orange-200">
          {t("legal_back_home")}
        </Link>

        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-300">
          {t("beta_badge")}
        </span>
        <h1 className="mt-4 text-3xl font-bold text-white md:text-4xl">{t("beta_title")}</h1>
        <p className="mt-3 leading-relaxed text-slate-400">{t("beta_sub")}</p>

        {betaClosed ? (
          <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <p className="text-lg font-bold text-white">{t("beta_closed_title")}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{t("beta_closed_body")}</p>
            <Link href="/pricing" className={`${btnPrimary} mt-4 inline-flex px-5 py-2.5 text-sm`}>
              {t("nav_pricing")}
            </Link>
          </div>
        ) : state === "ok" ? (
          <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.07] p-6">
            <p className="text-lg font-bold text-emerald-300">{t("beta_ok_title")}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">{t("beta_ok_body")}</p>
            <Link href="/login" className={`${btnPrimary} mt-4 inline-flex px-5 py-2.5 text-sm`}>
              {t("beta_ok_cta")}
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">{t("beta_email_label")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("beta_email_ph")}
                required
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">{t("beta_name_label")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-400"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">{t("beta_note_label")}</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder={t("beta_note_ph")}
                className="w-full resize-none rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-orange-400"
              />
            </div>

            {state === "error" && (
              <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">{err}</p>
            )}

            <button type="submit" disabled={state === "sending"} className={`${btnPrimary} w-full px-6 py-3 text-base disabled:opacity-60`}>
              {state === "sending" ? t("beta_sending") : t("beta_submit")}
            </button>
            <p className="text-center text-[11px] text-slate-600">{t("beta_privacy")}</p>
          </form>
        )}
      </main>
    </div>
  );
}
