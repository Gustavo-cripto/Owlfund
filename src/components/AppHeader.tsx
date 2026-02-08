"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();
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
      ? "mt-6 h-28 w-28 rounded-full object-cover shadow-lg [transform:scaleX(-1)]"
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

  const isActiveHref = (href: string) => {
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navLinkClass = (href: string) => {
    const isActive = isActiveHref(href);
    return `app-nav-link rounded-full px-4 py-2 text-base font-semibold transition ${
      isActive
        ? "bg-slate-800 text-white"
        : "text-slate-200 hover:bg-slate-950/60 hover:text-white"
    }`;
  };

  return (
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6">
      <div className="flex items-center gap-3">
        <img src="/owlfund-owl.png" alt="Owlfund" className={logoClassName} />
        <div>
          <p className="brand-accent text-sm font-semibold uppercase tracking-[0.3em] text-orange-300/80">
            {title}
          </p>
          <p className="text-sm text-slate-400">{computedSubtitle}</p>
        </div>
      </div>

      <nav className="hidden items-center md:flex">
        {variant === "public" ? (
          <div className="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/40 p-1.5 backdrop-blur">
            <a className="app-nav-link rounded-full px-4 py-2 text-base font-semibold transition hover:bg-slate-950/60 hover:text-white" href="#recursos">
              Recursos
            </a>
            <a className="app-nav-link rounded-full px-4 py-2 text-base font-semibold transition hover:bg-slate-950/60 hover:text-white" href="#fluxo">
              Fluxo
            </a>
            <a className="app-nav-link rounded-full px-4 py-2 text-base font-semibold transition hover:bg-slate-950/60 hover:text-white" href="#contato">
              Contato
            </a>
          </div>
        ) : (
          <div className="flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900/40 p-1.5 backdrop-blur">
            <a className={navLinkClass("/dashboard")} href="/dashboard">
              Dashboard
            </a>
            <a className={navLinkClass("/portfolio")} href="/portfolio">
              Portfolio
            </a>
            <a className={navLinkClass("/wallets")} href="/wallets">
              Carteiras
            </a>
            <a className={navLinkClass("/mercado")} href="/mercado">
              Mercado
            </a>
            <a className={navLinkClass("/account")} href="/account">
              Conta
            </a>
          </div>
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
            <button
              type="button"
              onClick={handleToggleTheme}
              className="rounded-full border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              aria-label={theme === "dark" ? "Modo escuro" : "Modo claro"}
              title={theme === "dark" ? "Modo escuro" : "Modo claro"}
            >
              {theme === "dark" ? "🌙" : "☀️"}
            </button>

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

