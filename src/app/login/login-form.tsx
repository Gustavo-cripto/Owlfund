"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { btnPrimary } from "@/lib/ui/buttons";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";
import { sanitizeNext } from "@/lib/auth/redirects";

export type LoginFormProps = {
  nextParam: string | null;
  modeParam?: string | null;
  emailParam?: string | null;
  errorParam?: string | null;
};

const MIN_PASSWORD = 8;

// Mensagens do Supabase (em inglês) → chaves traduzidas, por código ou por texto.
function mapAuthError(err: { code?: string; message?: string } | null | undefined): TranslationKey {
  const code = err?.code ?? "";
  const msg = (err?.message ?? "").toLowerCase();
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "lg_err_credentials";
  if (code === "email_not_confirmed" || msg.includes("not confirmed")) return "lg_err_not_confirmed";
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || msg.includes("rate limit") || msg.includes("security purposes")) return "lg_err_rate";
  if (code === "user_already_exists" || msg.includes("already registered")) return "lg_err_exists";
  if (code === "weak_password" || msg.includes("password should")) return "lg_err_weak";
  if (code === "same_password" || msg.includes("different from the old")) return "lg_err_same";
  if (code === "email_address_invalid" || msg.includes("invalid email")) return "lg_err_email";
  if (code === "signup_disabled") return "lg_err_signup_disabled";
  return "lg_err_generic";
}

export default function LoginForm({ nextParam, modeParam, emailParam, errorParam }: LoginFormProps) {
  const supabase = createClient();
  const { t } = useLanguage();
  const nextPath = sanitizeNext(nextParam);
  const [email, setEmail] = useState(emailParam ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">(modeParam === "signup" ? "signup" : "login");
  const [showMfa, setShowMfa] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [signedUp, setSignedUp] = useState(false);
  const [canResend, setCanResend] = useState(false);
  const [resent, setResent] = useState(false);

  // Após autenticar, se a conta tiver 2FA ativo mas a sessão ainda for aal1,
  // mostra o desafio do código; caso contrário redireciona.
  const finishOrChallenge = async () => {
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal && aal.nextLevel === "aal2" && aal.currentLevel === "aal1") {
        setShowMfa(true);
        setIsCheckingSession(false);
        setLoading(false);
        return;
      }
      window.location.href = nextPath;
    } catch {
      window.location.href = nextPath;
    }
  };

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession()
      .then(({ data }: { data: { session: unknown } }) => {
        if (!isMounted) return;
        if (data.session) { void finishOrChallenge(); return; }
        setIsCheckingSession(false);
      })
      .catch(() => { if (isMounted) setIsCheckingSession(false); });
    return () => { isMounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, nextParam]);

  // Vindo do callback com erro (link expirado / aberto noutro browser).
  useEffect(() => {
    if (errorParam === "expired") { setMessage(t("lg_err_link_expired")); setIsError(true); setCanResend(true); }
    else if (errorParam === "confirm") { setMessage(t("lg_err_link_invalid")); setIsError(true); setCanResend(true); }
  }, [errorParam, t]);

  const fail = (msg: string) => { setMessage(msg); setIsError(true); };

  // Nunca fazer trim à palavra-passe (espaços são caracteres válidos).
  const validateCredentials = () => {
    const nextEmail = email.trim();
    if (!nextEmail || !password) { fail(t("lg_err_fill")); return null; }
    if (password.length < MIN_PASSWORD) { fail(t("lg_err_short").replace("{n}", String(MIN_PASSWORD))); return null; }
    return { email: nextEmail, password };
  };

  const handleEmailLogin = async () => {
    setLoading(true); setMessage(null); setIsError(false); setCanResend(false);
    const creds = validateCredentials();
    if (!creds) { setLoading(false); return; }
    try {
      const { error } = await supabase.auth.signInWithPassword(creds);
      if (error) {
        const key = mapAuthError(error);
        fail(t(key));
        if (key === "lg_err_not_confirmed") setCanResend(true);
        setLoading(false);
        return;
      }
      await finishOrChallenge();
    } catch { fail(t("lg_err_generic")); setLoading(false); }
  };

  const submitMfa = async () => {
    setLoading(true); setMessage(null); setIsError(false);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totp = factors?.totp?.find((f: { id: string; status: string }) => f.status === "verified");
      if (!totp) { fail(t("lg_mfa_no_factor")); return; }
      const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (cErr || !challenge) { fail(t("lg_mfa_challenge_error")); return; }
      const { error: vErr } = await supabase.auth.mfa.verify({ factorId: totp.id, challengeId: challenge.id, code: mfaCode.trim() });
      if (vErr) { fail(t("ac_2fa_invalid")); return; }
      window.location.href = nextPath;
    } catch { fail(t("lg_err_generic")); }
    finally { setLoading(false); }
  };

  const submitRecovery = async () => {
    setLoading(true); setMessage(null); setIsError(false);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      const res = await fetch("/api/mfa/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: recoveryCode.trim() }),
      });
      if (!res.ok) { fail(res.status === 429 ? t("lg_err_rate") : t("lg_recovery_invalid")); return; }
      window.location.href = nextPath;
    } catch { fail(t("lg_err_generic")); }
    finally { setLoading(false); }
  };

  const handleSignUp = async () => {
    setLoading(true); setMessage(null); setIsError(false);
    const creds = validateCredentials();
    if (!creds) { setLoading(false); return; }
    if (!confirmPassword) { fail(t("lg_err_confirm")); setLoading(false); return; }
    if (creds.password !== confirmPassword) { fail(t("lg_err_mismatch")); setLoading(false); return; }
    if (creds.password.toLowerCase() === creds.email.toLowerCase()) { fail(t("ac_password_weak")); setLoading(false); return; }
    try {
      const origin = window.location.origin;
      const { data, error } = await supabase.auth.signUp({
        ...creds,
        options: { emailRedirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(nextPath)}` },
      });
      if (error) { fail(t(mapAuthError(error))); return; }
      // Com "confirm email" ativo, um email já registado devolve sucesso falso com
      // identities vazio (anti-enumeração) — dizer ao utilizador para entrar.
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        fail(t("lg_err_exists"));
        setMode("login");
        return;
      }
      setSignedUp(true);
      setMessage(t("lg_signup_ok"));
      setIsError(false);
      setCanResend(true);
    } catch { fail(t("lg_err_generic")); }
    finally { setLoading(false); }
  };

  const resendConfirmation = async () => {
    const nextEmail = email.trim();
    if (!nextEmail) { fail(t("lg_err_email_first")); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: nextEmail, options: { emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(nextPath)}` } });
      if (error) fail(t(mapAuthError(error)));
      else { setResent(true); setMessage(t("lg_resent")); setIsError(false); }
    } catch { fail(t("lg_err_generic")); }
    finally { setLoading(false); }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true); setMessage(null); setIsError(false);
    try {
      const origin = window.location.origin;
      // `next` vai no redirectTo — o `state` é gerido pelo PKCE e não chegava ao callback.
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${origin}/api/auth/callback?next=${encodeURIComponent(nextPath)}` },
      });
      if (error) { fail(t("lg_err_google")); setGoogleLoading(false); }
    } catch { fail(t("lg_err_google")); setGoogleLoading(false); }
  };

  const handleReset = async () => {
    const nextEmail = email.trim();
    if (!nextEmail) { fail(t("lg_err_email_first")); return; }
    setLoading(true); setMessage(null); setIsError(false);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(nextEmail, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) fail(t(mapAuthError(error)));
      else { setMessage(t("lg_reset_sent")); setIsError(false); }
    } catch { fail(t("lg_err_generic")); }
    finally { setLoading(false); }
  };

  const handleSubmit = (e?: React.FormEvent) => { e?.preventDefault(); return mode === "login" ? handleEmailLogin() : handleSignUp(); };
  const busy = loading || googleLoading || isCheckingSession;
  const toBeta = nextPath === "/beta";

  const inputClass =
    "w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-orange-400 focus:ring-1 focus:ring-orange-400/40";

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-40 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-orange-500/10 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[420px] rounded-full bg-slate-700/20 blur-[110px]" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
        <Link className="mx-auto text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-200" href={toBeta ? "/beta" : "/"}>
          {toBeta ? `← ${t("nav_beta_signup")}` : t("legal_back_home")}
        </Link>

        <div className="flex flex-col items-center gap-3 text-center">
          <img src="/chainfolioai-icon.png" alt="ChainFolioAI" className="h-16 w-16 rounded-2xl border border-white/10 object-cover shadow-lg shadow-black/40" />
          <div>
            <h1 className="text-2xl font-bold text-white">
              {showMfa ? t("lg_mfa_title") : mode === "signup" ? t("lg_signup_title") : t("lg_login_title")}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {showMfa ? t("lg_mfa_sub") : mode === "signup" ? (toBeta ? t("lg_signup_sub_beta") : t("lg_signup_sub")) : t("lg_login_sub")}
            </p>
          </div>
        </div>

        {showMfa && (
          <form onSubmit={(e) => { e.preventDefault(); if (recoveryMode ? recoveryCode.trim() : mfaCode.length === 6) void (recoveryMode ? submitRecovery() : submitMfa()); }}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/30 backdrop-blur space-y-4">
            {recoveryMode ? (
              <input
                autoFocus
                aria-label={t("lg_recovery_label")}
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX"
                autoComplete="off"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-center text-lg tracking-[0.2em] text-white outline-none transition focus:border-orange-400"
              />
            ) : (
              <input
                inputMode="numeric"
                maxLength={6}
                autoFocus
                aria-label={t("ac_2fa_enter")}
                autoComplete="one-time-code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-center text-lg tracking-[0.5em] text-white outline-none transition focus:border-orange-400"
              />
            )}
            {message ? (
              <p role="alert" className={`rounded-lg border px-3 py-2 text-sm ${isError ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>{message}</p>
            ) : null}
            <button type="submit" disabled={loading || (recoveryMode ? !recoveryCode.trim() : mfaCode.length !== 6)} className={`${btnPrimary} w-full px-6 py-3 text-sm`}>
              {loading ? t("lg_verifying") : t("lg_verify")}
            </button>
            <button type="button" onClick={() => { setRecoveryMode((v) => !v); setMessage(null); setIsError(false); }} className="w-full text-center text-xs text-orange-300/80 transition hover:text-orange-200">
              {recoveryMode ? `← ${t("lg_use_app_code")}` : t("lg_use_recovery")}
            </button>
            <button type="button" onClick={async () => { await supabase.auth.signOut(); setShowMfa(false); setMfaCode(""); setRecoveryCode(""); setRecoveryMode(false); setMessage(null); }} className="w-full text-center text-xs text-slate-500 transition hover:text-slate-200">
              {t("lg_other_account")}
            </button>
          </form>
        )}

        {!showMfa && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/30 backdrop-blur">
          {toBeta && (
            <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/[0.08] px-4 py-3 text-xs leading-relaxed text-amber-200">🧪 {t("lg_beta_hint")}</div>
          )}
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-full border border-slate-800 bg-slate-950 p-1" role="tablist">
            {(["login", "signup"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m}
                onClick={() => { setMode(m); setMessage(null); setIsError(false); setSignedUp(false); setCanResend(false); }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === m ? "bg-orange-500 text-slate-950" : "text-slate-400 hover:text-white"}`}>
                {m === "login" ? t("lg_tab_login") : t("lg_tab_signup")}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="lg-email" className="sr-only">Email</label>
              <input id="lg-email" className={inputClass} placeholder="Email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="relative">
              <label htmlFor="lg-password" className="sr-only">{t("lg_password")}</label>
              <input id="lg-password" className={`${inputClass} pr-20`} placeholder={t("lg_password")} type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? MIN_PASSWORD : undefined}
                value={password} onChange={(event) => setPassword(event.target.value)} />
              <button type="button" onClick={() => setShowPassword((v) => !v)} aria-pressed={showPassword} aria-label={showPassword ? t("ac_hide") : t("ac_show")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 transition hover:text-slate-200">
                {showPassword ? t("ac_hide") : t("ac_show")}
              </button>
            </div>
            {mode === "signup" ? (
              <div>
                <label htmlFor="lg-confirm" className="sr-only">{t("lg_confirm_password")}</label>
                <input id="lg-confirm" className={inputClass} placeholder={t("lg_confirm_password")} type={showPassword ? "text" : "password"} autoComplete="new-password" required
                  value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
                <p className="mt-1.5 text-[11px] text-slate-500">{t("lg_pw_hint").replace("{n}", String(MIN_PASSWORD))}</p>
              </div>
            ) : null}
          </div>

          {mode === "login" && (
            <button type="button" onClick={handleReset} disabled={busy} className="mt-2 text-xs text-slate-400 transition hover:text-orange-300 disabled:opacity-50">
              {t("lg_forgot")}
            </button>
          )}

          {message ? (
            <p role="alert" className={`mt-4 rounded-lg border px-3 py-2 text-sm ${isError ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>
              {message}
            </p>
          ) : null}
          {canResend && !resent && (
            <button type="button" onClick={resendConfirmation} disabled={busy} className="mt-2 text-xs text-orange-300 underline decoration-dotted hover:text-orange-200 disabled:opacity-50">
              {t("lg_resend")}
            </button>
          )}
          {signedUp && toBeta && (
            <Link href={`/beta?email=${encodeURIComponent(email.trim())}`} className={`${btnPrimary} mt-4 block w-full px-6 py-3 text-center text-sm`}>
              🧪 {t("lg_go_beta")} →
            </Link>
          )}

          {!signedUp && (
            <button className={`${btnPrimary} mt-5 w-full px-6 py-3 text-sm`} disabled={busy} type="submit">
              {loading ? t("lg_wait") : mode === "login" ? t("lg_tab_login") : t("lg_tab_signup")}
            </button>
          )}

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-xs text-slate-500">{t("lg_or")}</span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          <button
            className="flex w-full items-center justify-center gap-3 rounded-full border border-slate-700 bg-slate-950 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleGoogle} disabled={busy} type="button">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
            </svg>
            {googleLoading ? t("lg_google_loading") : t("lg_google")}
          </button>
        </form>
        )}

        <p className="text-center text-xs text-slate-600">
          {t("lg_terms_1")} <Link href="/termos" className="underline decoration-dotted hover:text-slate-400">{t("legal_terms_short")}</Link> {t("lg_terms_2")} <Link href="/privacidade" className="underline decoration-dotted hover:text-slate-400">{t("legal_privacy_short")}</Link>.
        </p>
      </main>
    </div>
  );
}
