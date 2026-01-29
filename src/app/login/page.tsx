"use client";

import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const validateCredentials = () => {
    const nextEmail = email.trim();
    const nextPassword = password.trim();

    if (!nextEmail || !nextPassword) {
      setMessage("Preenche email e senha.");
      return null;
    }

    if (nextPassword.length < 6) {
      setMessage("A senha deve ter pelo menos 6 caracteres.");
      return null;
    }

    return { email: nextEmail, password: nextPassword };
  };

  const handleEmailLogin = async () => {
    setLoading(true);
    setMessage(null);

    const creds = validateCredentials();
    if (!creds) {
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword(creds);
    if (error) {
      setMessage(error.message || "Não foi possível entrar. Verifica os dados.");
    } else {
      setMessage("Login realizado. Redirecionando...");
      window.location.href = "/dashboard";
    }

    setLoading(false);
  };

  const handleSignUp = async () => {
    setLoading(true);
    setMessage(null);

    const origin = window.location.origin;
    const creds = validateCredentials();
    if (!creds) {
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
      setMessage(error.message || "Não foi possível criar a conta.");
    } else {
      setMessage("Conta criada. Verifica o email para confirmar.");
    }

    setLoading(false);
  };

  const handleGoogle = async () => {
    setLoading(true);
    setMessage(null);

    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/api/auth/callback`,
      },
    });

    if (error) {
      setMessage(error.message || "Não foi possível iniciar com Google.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 pb-20 pt-12">
        <a
          className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 transition hover:text-slate-200"
          href="/"
        >
          Voltar para início
        </a>
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.3em] text-orange-300/80">
            Acesso
          </p>
          <h1 className="text-3xl font-semibold text-white">Entrar na Owlfund</h1>
          <p className="text-sm text-slate-400">
            Use email e senha ou faça login com Google.
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="space-y-4">
            <input
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-orange-400"
              placeholder="Email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <input
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-orange-400"
              placeholder="Senha"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {message ? <p className="mt-4 text-sm text-orange-200">{message}</p> : null}

          <div className="mt-6 flex flex-col gap-3">
            <button
              className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-70"
              onClick={handleEmailLogin}
              disabled={loading}
              type="button"
            >
              Entrar
            </button>
            <button
              className="rounded-full border border-slate-700 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
              onClick={handleSignUp}
              disabled={loading}
              type="button"
            >
              Criar conta
            </button>
            <button
              className="rounded-full border border-orange-400/40 px-6 py-3 text-sm font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
              onClick={handleGoogle}
              disabled={loading}
              type="button"
            >
              Entrar com Google
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
