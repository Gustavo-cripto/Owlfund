"use client";

import { useEffect, useState } from "react";
import { btnPrimary } from "@/lib/ui/buttons";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";

const MIN_PASSWORD = 8;

export default function ResetPasswordPage() {
  const supabase = createClient();
  const { t } = useLanguage();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const markReady = () => {
      if (!active) return;
      setReady(true); setChecking(false);
      // Limpa code/token da barra de endereço (não fica no histórico).
      try { window.history.replaceState(null, "", window.location.pathname); } catch { /* ignore */ }
    };

    const code = new URLSearchParams(window.location.search).get("code");
    const hasHash = window.location.hash.includes("access_token");

    // Fluxo PKCE (código no query string): só se decide depois do exchange —
    // antes, um timeout de 1,5 s mostrava "link inválido" a meio da troca.
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error }: { error: unknown }) => { if (!active) return; if (error) setChecking(false); else markReady(); })
        .catch(() => { if (active) setChecking(false); });
    }

    // Fluxo implícito: só o evento de recuperação abre o formulário (uma sessão
    // normal já existente não deve permitir trocar a palavra-passe daqui).
    const { data: sub } = supabase.auth.onAuthStateChange((event: string, session: unknown) => {
      if (event === "PASSWORD_RECOVERY" && session) markReady();
    });

    if (!code && !hasHash) {
      const tm = setTimeout(() => { if (active) setChecking(false); }, 1500);
      return () => { active = false; clearTimeout(tm); sub.subscription.unsubscribe(); };
    }
    if (hasHash) {
      const tm = setTimeout(() => { if (active) setChecking(false); }, 6000);
      return () => { active = false; clearTimeout(tm); sub.subscription.unsubscribe(); };
    }
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [supabase]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setMessage(null); setIsError(false);
    if (password.length < MIN_PASSWORD) { setMessage(t("lg_err_short").replace("{n}", String(MIN_PASSWORD))); setIsError(true); return; }
    if (password !== confirm) { setMessage(t("lg_err_mismatch")); setIsError(true); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const m = error.message.toLowerCase();
        setMessage(m.includes("different from the old") ? t("lg_err_same") : m.includes("password should") ? t("lg_err_weak") : t("rp_err_generic"));
        setIsError(true);
        return;
      }
      // Termina outras sessões (quem tinha a palavra-passe antiga deixa de entrar).
      try { await supabase.auth.signOut({ scope: "others" }); } catch { /* ignore */ }
      setDone(true);
      setMessage(t("rp_done"));
      setIsError(false);
      setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
    } catch { setMessage(t("rp_err_generic")); setIsError(true); }
    finally { setLoading(false); }
  };

  const inputClass =
    "w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-orange-400 focus:ring-1 focus:ring-orange-400/40";

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-40 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-orange-500/10 blur-[130px]" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/chainfolioai-icon.png" alt="ChainFolioAI" className="h-16 w-16 rounded-2xl border border-white/10 object-cover shadow-lg shadow-black/40" />
          <div>
            <h1 className="text-2xl font-bold text-white">{t("rp_title")}</h1>
            <p className="mt-1 text-sm text-slate-400">{t("rp_sub")}</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/30 backdrop-blur">
          {checking && !ready ? (
            <p className="text-center text-sm text-slate-400">{t("rp_checking")}</p>
          ) : !ready ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-red-300" role="alert">{t("rp_invalid")}</p>
              <a href="/login" className={`${btnPrimary} px-6 py-2.5 text-sm`}>{t("rp_back_login")}</a>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              <div className="relative">
                <label htmlFor="rp-new" className="sr-only">{t("rp_new")}</label>
                <input id="rp-new" autoFocus className={`${inputClass} pr-20`} placeholder={t("rp_new")} type={show ? "text" : "password"} autoComplete="new-password" required minLength={MIN_PASSWORD}
                  value={password} onChange={(e) => setPassword(e.target.value)} disabled={done} />
                <button type="button" onClick={() => setShow((v) => !v)} aria-pressed={show} aria-label={show ? t("ac_hide") : t("ac_show")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 transition hover:text-slate-200">
                  {show ? t("ac_hide") : t("ac_show")}
                </button>
              </div>
              <label htmlFor="rp-confirm" className="sr-only">{t("rp_confirm")}</label>
              <input id="rp-confirm" className={inputClass} placeholder={t("rp_confirm")} type={show ? "text" : "password"} autoComplete="new-password" required
                value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={done} />
              <p className="text-[11px] text-slate-500">{t("lg_pw_hint").replace("{n}", String(MIN_PASSWORD))}</p>
              {message ? (
                <p role="alert" className={`rounded-lg border px-3 py-2 text-sm ${isError ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>{message}</p>
              ) : null}
              <button type="submit" disabled={loading || done} className={`${btnPrimary} w-full px-6 py-3 text-sm`}>
                {loading ? t("ac_saving") : t("rp_submit")}
              </button>
              <a href="/login" className="block text-center text-xs text-slate-500 hover:text-slate-300">{t("rp_back_login")}</a>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
