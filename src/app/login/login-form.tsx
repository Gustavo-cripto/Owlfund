"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { btnPrimary } from "@/lib/ui/buttons";

import { createClient } from "@/lib/supabase/client";

const ALLOWED_NEXT_PATHS = ["/dashboard", "/wallets", "/portfolio", "/market"];

function getRedirectUrl(nextParam: string | null): string {
  if (!nextParam) return "/dashboard";
  const path = nextParam.startsWith("/") ? nextParam : `/${nextParam}`;
  const allowed = ALLOWED_NEXT_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`)
  );
  return allowed ? path : "/dashboard";
}

export type LoginFormProps = { nextParam: string | null };

export default function LoginForm({ nextParam }: LoginFormProps) {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showMfa, setShowMfa] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");

  // Após autenticar, se a conta tiver 2FA ativo mas a sessão ainda for aal1,
  // mostra o desafio do código; caso contrário redireciona.
  const finishOrChallenge = async () => {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal && aal.nextLevel === "aal2" && aal.currentLevel === "aal1") {
      setShowMfa(true);
      setIsCheckingSession(false);
      setLoading(false);
      return;
    }
    window.location.href = getRedirectUrl(nextParam);
  };

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      if (!isMounted) return;
      if (data.session) {
        finishOrChallenge();
        return;
      }
      setIsCheckingSession(false);
    });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, nextParam]);

  const fail = (msg: string) => {
    setMessage(msg);
    setIsError(true);
  };

  const validateCredentials = () => {
    const nextEmail = email.trim();
    const nextPassword = password.trim();

    if (!nextEmail || !nextPassword) {
      fail("Preenche o email e a senha.");
      return null;
    }

    if (nextPassword.length < 6) {
      fail("A senha deve ter pelo menos 6 caracteres.");
      return null;
    }

    return { email: nextEmail, password: nextPassword };
  };

  const handleEmailLogin = async () => {
    setLoading(true);
    setMessage(null);
    setIsError(false);

    const creds = validateCredentials();
    if (!creds) {
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword(creds);
    if (error) {
      fail(error.message || "Não foi possível entrar. Verifica os dados.");
      setLoading(false);
    } else {
      await finishOrChallenge();
    }
  };

  const submitMfa = async () => {
    setLoading(true);
    setMessage(null);
    setIsError(false);
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totp = factors?.totp?.find((f: { id: string; status: string }) => f.status === "verified");
    if (!totp) {
      fail("Fator de 2FA não encontrado.");
      setLoading(false);
      return;
    }
    const { data: challenge, error: cErr } = await supabase.auth.mfa.challenge({ factorId: totp.id });
    if (cErr || !challenge) {
      fail(cErr?.message ?? "Não foi possível iniciar o desafio 2FA.");
      setLoading(false);
      return;
    }
    const { error: vErr } = await supabase.auth.mfa.verify({
      factorId: totp.id,
      challengeId: challenge.id,
      code: mfaCode.trim(),
    });
    if (vErr) {
      fail("Código inválido. Verifica na app e tenta de novo.");
      setLoading(false);
      return;
    }
    window.location.href = getRedirectUrl(nextParam);
  };

  const submitRecovery = async () => {
    setLoading(true);
    setMessage(null);
    setIsError(false);
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token ?? "";
    const res = await fetch("/api/mfa/recover", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code: recoveryCode }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({})) as { error?: string };
      fail(j.error ?? "Código de recuperação inválido.");
      setLoading(false);
      return;
    }
    // 2FA foi removido; a sessão aal1 já é suficiente.
    window.location.href = getRedirectUrl(nextParam);
  };

  const handleSignUp = async () => {
    setLoading(true);
    setMessage(null);
    setIsError(false);

    const origin = window.location.origin;
    const creds = validateCredentials();
    if (!creds) {
      setLoading(false);
      return;
    }

    const nextConfirm = confirmPassword.trim();
    if (!nextConfirm) {
      fail("Confirma a senha.");
      setLoading(false);
      return;
    }

    if (creds.password !== nextConfirm) {
      fail("As senhas não coincidem.");
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signUp({
      ...creds,
      options: {
        emailRedirectTo: `${origin}/api/auth/callback`,
      },
    });
    if (error) {
      fail(error.message || "Não foi possível criar a conta.");
    } else {
      setMessage("Conta criada! Verifica o teu email para confirmar.");
      setIsError(false);
    }

    setLoading(false);
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setMessage(null);
    setIsError(false);

    const origin = window.location.origin;
    const state = nextParam ? `next:${nextParam.startsWith("/") ? nextParam : `/${nextParam}`}` : undefined;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/api/auth/callback`,
        ...(state && { state }),
      },
    });

    if (error) {
      fail(error.message || "Não foi possível iniciar sessão com Google.");
      setGoogleLoading(false);
    }
  };

  const handleReset = async () => {
    const nextEmail = email.trim();
    if (!nextEmail) {
      fail("Escreve o teu email primeiro e depois clica em \"Esqueceste a senha?\".");
      return;
    }
    setLoading(true);
    setMessage(null);
    setIsError(false);
    const { error } = await supabase.auth.resetPasswordForEmail(nextEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      fail(error.message || "Não foi possível enviar o email.");
    } else {
      setMessage("Email enviado! Verifica a tua caixa de entrada para redefinir a senha.");
      setIsError(false);
    }
    setLoading(false);
  };

  const handleSubmit = () => (mode === "login" ? handleEmailLogin() : handleSignUp());
  const busy = loading || googleLoading || isCheckingSession;

  const inputClass =
    "w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-orange-400 focus:ring-1 focus:ring-orange-400/40";

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      {/* Background glows */}
      <div className="pointer-events-none absolute inset-0" aria-hidden>
        <div className="absolute -top-40 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-orange-500/10 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-[360px] w-[420px] rounded-full bg-slate-700/20 blur-[110px]" />
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-12">
        <Link
          className="mx-auto text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-200"
          href="/"
        >
          ← Voltar para início
        </Link>

        {/* Brand */}
        <div className="flex flex-col items-center gap-3 text-center">
          <img
            src="/chainfolioai-icon.png"
            alt="ChainFolioAI"
            className="h-16 w-16 rounded-2xl border border-white/10 object-cover shadow-lg shadow-black/40"
          />
          <div>
            <h1 className="text-2xl font-bold text-white">
              {showMfa ? "Verificação em duas etapas" : mode === "signup" ? "Cria a tua conta" : "Bem-vindo de volta"}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {showMfa
                ? "Introduz o código de 6 dígitos da tua app autenticadora."
                : mode === "signup"
                ? "Grátis para começar — sem cartão."
                : "Entra na tua conta ChainFolioAI."}
            </p>
          </div>
        </div>

        {showMfa && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/30 backdrop-blur space-y-4">
            {recoveryMode ? (
              <input
                autoFocus
                value={recoveryCode}
                onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === "Enter" && recoveryCode.trim()) submitRecovery(); }}
                placeholder="XXXX-XXXX"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-center text-lg tracking-[0.2em] text-white outline-none transition focus:border-orange-400"
              />
            ) : (
              <input
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter" && mfaCode.length === 6) submitMfa(); }}
                placeholder="000000"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-center text-lg tracking-[0.5em] text-white outline-none transition focus:border-orange-400"
              />
            )}
            {message ? (
              <p className={`rounded-lg border px-3 py-2 text-sm ${isError ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>{message}</p>
            ) : null}
            <button
              type="button"
              onClick={recoveryMode ? submitRecovery : submitMfa}
              disabled={loading || (recoveryMode ? !recoveryCode.trim() : mfaCode.length !== 6)}
              className={`${btnPrimary} w-full px-6 py-3 text-sm`}
            >
              {loading ? "A verificar..." : "Verificar"}
            </button>
            <button
              type="button"
              onClick={() => { setRecoveryMode((v) => !v); setMessage(null); setIsError(false); }}
              className="w-full text-center text-xs text-orange-300/80 transition hover:text-orange-200"
            >
              {recoveryMode ? "← Usar código da app autenticadora" : "Perdi o acesso? Usar código de recuperação"}
            </button>
            <button
              type="button"
              onClick={async () => { await supabase.auth.signOut(); setShowMfa(false); setMfaCode(""); setRecoveryCode(""); setRecoveryMode(false); setMessage(null); }}
              className="w-full text-center text-xs text-slate-500 transition hover:text-slate-200"
            >
              Usar outra conta
            </button>
          </div>
        )}

        {!showMfa && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/30 backdrop-blur">
          {/* Mode switcher */}
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-full border border-slate-800 bg-slate-950 p-1">
            {(["login", "signup"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setMessage(null); setIsError(false); }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  mode === m ? "bg-orange-500 text-slate-950" : "text-slate-400 hover:text-white"
                }`}
              >
                {m === "login" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            <input
              className={inputClass}
              placeholder="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && mode === "login") handleSubmit(); }}
            />
            <div className="relative">
              <input
                className={`${inputClass} pr-16`}
                placeholder="Senha"
                type={showPassword ? "text" : "password"}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && mode === "login") handleSubmit(); }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 transition hover:text-slate-200"
              >
                {showPassword ? "Esconder" : "Mostrar"}
              </button>
            </div>
            {mode === "signup" ? (
              <input
                className={inputClass}
                placeholder="Confirmar senha"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
              />
            ) : null}
          </div>

          {mode === "login" && (
            <button
              type="button"
              onClick={handleReset}
              disabled={busy}
              className="mt-2 text-xs text-slate-400 transition hover:text-orange-300 disabled:opacity-50"
            >
              Esqueceste a senha?
            </button>
          )}

          {message ? (
            <p
              className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
                isError
                  ? "border-red-500/30 bg-red-500/10 text-red-300"
                  : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              }`}
            >
              {message}
            </p>
          ) : null}

          <button
            className={`${btnPrimary} mt-5 w-full px-6 py-3 text-sm`}
            onClick={handleSubmit}
            disabled={busy}
            type="button"
          >
            {loading ? "Aguarda..." : mode === "login" ? "Entrar" : "Criar conta"}
          </button>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-800" />
            <span className="text-xs text-slate-500">ou</span>
            <div className="h-px flex-1 bg-slate-800" />
          </div>

          {/* Google */}
          <button
            className="flex w-full items-center justify-center gap-3 rounded-full border border-slate-700 bg-slate-950 px-6 py-3 text-sm font-semibold text-slate-100 transition hover:border-slate-500 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleGoogle}
            disabled={busy}
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
            </svg>
            {googleLoading ? "A ligar ao Google..." : "Continuar com Google"}
          </button>
        </div>
        )}

        <p className="text-center text-xs text-slate-600">
          Ao continuar, concordas em usar o ChainFolioAI em modo só-leitura.
        </p>
      </main>
    </div>
  );
}
