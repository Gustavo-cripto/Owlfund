"use client";

import { useEffect, useState } from "react";
import { btnPrimary } from "@/lib/ui/buttons";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = createClient();
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

    const markReady = () => { if (active) { setReady(true); setChecking(false); } };

    // Fluxo PKCE (código no query string)
    const code = new URLSearchParams(window.location.search).get("code");
    if (code) {
      supabase.auth.exchangeCodeForSession(code)
        .then(({ error }: { error: unknown }) => { if (!active) return; if (error) { setChecking(false); } else markReady(); });
    }

    // Fluxo implícito / evento de recuperação
    const { data: sub } = supabase.auth.onAuthStateChange((_event: unknown, session: unknown) => {
      if (session) markReady();
    });

    // Sessão já existente
    supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => {
      if (!active) return;
      if (data.session) markReady();
      else setTimeout(() => { if (active) setChecking(false); }, 1500);
    });

    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [supabase]);

  const submit = async () => {
    setMessage(null);
    setIsError(false);
    if (password.trim().length < 6) {
      setMessage("A senha deve ter pelo menos 6 caracteres.");
      setIsError(true);
      return;
    }
    if (password !== confirm) {
      setMessage("As senhas não coincidem.");
      setIsError(true);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: password.trim() });
    if (error) {
      setMessage(error.message || "Não foi possível redefinir a senha. Pede um novo link.");
      setIsError(true);
      setLoading(false);
      return;
    }
    setDone(true);
    setMessage("Senha redefinida com sucesso! A redirecionar...");
    setIsError(false);
    setTimeout(() => { window.location.href = "/dashboard"; }, 1500);
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
            <h1 className="text-2xl font-bold text-white">Redefinir senha</h1>
            <p className="mt-1 text-sm text-slate-400">Escolhe uma nova senha para a tua conta.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl shadow-black/30 backdrop-blur">
          {checking && !ready ? (
            <p className="text-center text-sm text-slate-400">A validar o link...</p>
          ) : !ready ? (
            <div className="space-y-3 text-center">
              <p className="text-sm text-red-300">O link é inválido ou expirou.</p>
              <a href="/login" className={`${btnPrimary} px-6 py-2.5 text-sm`}>
                Voltar ao login
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="relative">
                <input
                  className={`${inputClass} pr-16`}
                  placeholder="Nova senha"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={done}
                />
                <button type="button" onClick={() => setShow((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500 transition hover:text-slate-200">
                  {show ? "Esconder" : "Mostrar"}
                </button>
              </div>
              <input
                className={inputClass}
                placeholder="Confirmar nova senha"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                disabled={done}
              />
              {message ? (
                <p className={`rounded-lg border px-3 py-2 text-sm ${isError ? "border-red-500/30 bg-red-500/10 text-red-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"}`}>{message}</p>
              ) : null}
              <button type="button" onClick={submit} disabled={loading || done}
                className={`${btnPrimary} w-full px-6 py-3 text-sm`}>
                {loading ? "A guardar..." : "Redefinir senha"}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
