"use client";

import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type HeaderVariant = "public" | "app";
type ThemeMode = "dark" | "light";

type AppHeaderProps = {
  variant?: HeaderVariant;
  title?: string;
  subtitle?: string;
};

export default function AppHeader({
  variant = "app",
  title = "Owlfund",
  subtitle,
}: AppHeaderProps) {
  const supabase = createClient();
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("dark");

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      const session = data.session ?? null;
      setIsLoggedIn(!!session);
      setEmail(session?.user?.email ?? null);
      setIsReady(true);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session);
      setEmail(session?.user?.email ?? null);
      setIsReady(true);
    });

    return () => {
      isMounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      if (typeof document !== "undefined") {
        document.body.classList.toggle("theme-light", stored === "light");
      }
      return;
    }

    if (typeof window !== "undefined") {
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      const next = prefersLight ? "light" : "dark";
      setTheme(next);
      if (typeof document !== "undefined") {
        document.body.classList.toggle("theme-light", next === "light");
      }
    }
  }, []);

  const logoClassName =
    variant === "public"
      ? "mt-6 h-20 w-20 rounded-full object-cover shadow-lg [transform:scaleX(-1)]"
      : "h-12 w-12 rounded-full object-cover shadow-lg [transform:scaleX(-1)]";

  const computedSubtitle = useMemo(() => {
    if (subtitle) return subtitle;
    if (variant === "public") return "Controle inteligente de investimentos";
    return "Área do utilizador";
  }, [subtitle, variant]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const handleBack = () => {
    if (typeof window === "undefined") return;
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.href = "/dashboard";
  };

  const handleToggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (typeof document !== "undefined") {
      document.body.classList.toggle("theme-light", next === "light");
    }
    if (typeof window !== "undefined") {
      localStorage.setItem("theme", next);
    }
  };

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
      <div className="flex items-center gap-3">
        <img src="/owlfund-owl.png" alt="Owlfund" className={logoClassName} />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-orange-300/80">
            {title}
          </p>
          <p className="text-sm text-slate-400">{computedSubtitle}</p>
        </div>
      </div>

      <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
        {variant === "public" ? (
          <>
            <a className="app-nav-link transition hover:text-white" href="#recursos">
              Recursos
            </a>
            <a className="app-nav-link transition hover:text-white" href="#fluxo">
              Fluxo
            </a>
            <a className="app-nav-link transition hover:text-white" href="#contato">
              Contato
            </a>
          </>
        ) : (
          <>
            <a className="app-nav-link transition hover:text-white" href="/dashboard">
              Dashboard
            </a>
            <a className="app-nav-link transition hover:text-white" href="/portfolio">
              Portfolio
            </a>
            <a className="app-nav-link transition hover:text-white" href="/wallets">
              Carteiras
            </a>
            <a className="app-nav-link transition hover:text-white" href="/mercado">
              Mercado
            </a>
            <a className="app-nav-link transition hover:text-white" href="/account">
              Conta
            </a>
          </>
        )}
      </nav>

      <div className="flex items-center gap-4">
        {variant === "public" ? (
          <>
            {isReady ? (
              isLoggedIn ? (
                <a
                  className="text-sm font-semibold text-slate-200 transition hover:text-white"
                  href="/dashboard"
                >
                  Dashboard
                </a>
              ) : (
                <a
                  className="text-sm font-semibold text-slate-200 transition hover:text-white"
                  href="/login"
                >
                  Entrar
                </a>
              )
            ) : (
              <span className="text-xs uppercase tracking-[0.3em] text-slate-500">
                Carregando
              </span>
            )}

            <a
              className="rounded-full border border-orange-400/40 px-4 py-2 text-sm font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white"
              href="#contato"
            >
              Solicitar demo
            </a>
          </>
        ) : (
          <>
            <span className="hidden text-sm text-slate-400 md:inline">
              {isReady && email ? email : ""}
            </span>
            <button
              type="button"
              onClick={handleBack}
              className="rounded-full border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleToggleTheme}
              className="rounded-full border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              aria-label={theme === "dark" ? "Modo escuro" : "Modo claro"}
              title={theme === "dark" ? "Modo escuro" : "Modo claro"}
            >
              {theme === "dark" ? "🌙" : "☀️"}
            </button>
            {isReady && isLoggedIn ? (
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              >
                Sair
              </button>
            ) : (
              <a
                className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                href="/login"
              >
                Entrar
              </a>
            )}
          </>
        )}
      </div>
    </header>
  );
}

