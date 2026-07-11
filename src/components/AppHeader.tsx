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
  title = "ChainFolioAI",
  subtitle,
}: AppHeaderProps) {
  const supabase = createClient();
  const pathname = usePathname();
  const [isReady, setIsReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>("dark");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;
    supabase.auth.getSession().then(({ data }: { data: { session: { user: { email?: string } } | null } }) => {
      if (!isMounted) return;
      const session = data.session ?? null;
      setIsLoggedIn(!!session);
      setEmail(session?.user?.email ?? null);
      setIsReady(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event: unknown, session: { user: { email?: string } } | null) => {
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
      document.body?.classList.toggle("theme-light", stored === "light");
      document.documentElement.classList.toggle("dark", stored === "dark");
      return;
    }
    if (typeof window !== "undefined") {
      const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
      const next = prefersLight ? "light" : "dark";
      setTheme(next);
      document.body?.classList.toggle("theme-light", next === "light");
      document.documentElement.classList.toggle("dark", next === "dark");
    }
  }, []);

  // Fechar menu mobile ao navegar
  useEffect(() => { setMobileMenuOpen(false); }, [pathname]);

  const computedSubtitle = useMemo(() => {
    if (subtitle) return subtitle;
    if (variant === "public") return "Controle inteligente de investimentos";
    return null;
  }, [subtitle, variant]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const handleToggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.body?.classList.toggle("theme-light", next === "light");
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  };

  const isActiveHref = (href: string) => {
    if (!pathname) return false;
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const navLinkClass = (href: string) =>
    `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
      isActiveHref(href)
        ? "bg-slate-800 text-white"
        : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
    }`;

  const gradientFrame = "rounded-full bg-gradient-to-r from-orange-500/40 via-slate-700/40 to-slate-900/40 p-[1px]";
  const btnClass = "rounded-full border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white";

  const appNavItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/portfolio", label: "Portfolio" },
    { href: "/wallets", label: "Carteiras" },
    { href: "/smart-money", label: "Smart Money" },
    { href: "/gestor", label: "Gestor IA" },
    { href: "/mercado", label: "Mercado" },
    { href: "/fiscalidade", label: "Impostos" },
    { href: "/fire", label: "FIRE" },
    { href: "/account", label: "Conta" },
  ];

  return (
    <header className="mx-auto w-full max-w-7xl px-4 pb-2 pt-4">
      {/* ── Linha principal ── */}
      <div className="flex items-center justify-between gap-3">
        {/* Logo + título */}
        <a href={variant === "app" ? "/dashboard" : "/"} className="flex items-center gap-2.5 flex-shrink-0">
          <img
            src="/chainfolioai-icon.png"
            alt="ChainFolioAI"
            className={variant === "public"
              ? "h-16 w-16 rounded-full object-cover shadow-lg [transform:scaleX(-1)]"
              : "h-10 w-10 rounded-full object-cover shadow-lg [transform:scaleX(-1)]"}
          />
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-orange-300/90">{title}</p>
            {computedSubtitle && (
              <p className="text-xs text-slate-400 leading-tight">{computedSubtitle}</p>
            )}
          </div>
        </a>

        {/* Nav desktop */}
        <nav className="hidden xl:flex items-center flex-1 justify-center">
          {variant === "public" ? (
            <div className="flex items-center gap-0.5 rounded-full border border-slate-800 bg-slate-900/40 p-1 backdrop-blur">
              {[{ href: "#recursos", label: "Recursos" }, { href: "#fluxo", label: "Fluxo" }, { href: "#contato", label: "Contato" }].map((item) => (
                <span key={item.href} className={gradientFrame}>
                  <a className={navLinkClass(item.href)} href={item.href}>{item.label}</a>
                </span>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-0.5 rounded-full border border-slate-800 bg-slate-900/40 p-1 backdrop-blur">
              {appNavItems.map((item) => (
                <span key={item.href} className={gradientFrame}>
                  <a className={navLinkClass(item.href)} href={item.href}>{item.label}</a>
                </span>
              ))}
            </div>
          )}
        </nav>

        {/* Ações direita */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {variant === "public" ? (
            <>
              <button type="button" onClick={handleToggleTheme} className={`${btnClass} px-2.5`} title="Tema">
                {theme === "dark" ? "🌙" : "☀️"}
              </button>
              <span className={gradientFrame}>
                {isReady && isLoggedIn
                  ? <a className={btnClass} href="/dashboard">Dashboard</a>
                  : <a className={btnClass} href="/login">Entrar</a>}
              </span>
              <span className={gradientFrame}>
                <a className="rounded-full border border-orange-400/60 bg-orange-500/10 px-3 py-1.5 text-sm font-semibold text-orange-200 transition hover:border-orange-400 hover:text-white" href="#contato">
                  Solicitar demo
                </a>
              </span>
            </>
          ) : (
            <>
              {isReady && email && (
                <span className="hidden lg:inline text-xs text-slate-500 max-w-[160px] truncate">{email}</span>
              )}
              <button type="button" onClick={handleToggleTheme} className={`${btnClass} px-2.5`} title="Tema">
                {theme === "dark" ? "🌙" : "☀️"}
              </button>
              <span className={gradientFrame}>
                {isReady && isLoggedIn
                  ? <button type="button" onClick={handleLogout} className={btnClass}>Sair</button>
                  : <a className={btnClass} href="/login">Entrar</a>}
              </span>
              {/* Hamburger mobile */}
              <button
                type="button"
                className="xl:hidden flex flex-col gap-[5px] p-2 rounded-lg border border-slate-800 bg-slate-900/40"
                onClick={() => setMobileMenuOpen((o) => !o)}
                aria-label="Menu"
              >
                <span className={`block h-0.5 w-5 bg-slate-300 transition-transform ${mobileMenuOpen ? "translate-y-[7px] rotate-45" : ""}`} />
                <span className={`block h-0.5 w-5 bg-slate-300 transition-opacity ${mobileMenuOpen ? "opacity-0" : ""}`} />
                <span className={`block h-0.5 w-5 bg-slate-300 transition-transform ${mobileMenuOpen ? "-translate-y-[7px] -rotate-45" : ""}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Menu mobile dropdown ── */}
      {variant === "app" && mobileMenuOpen && (
        <nav className="xl:hidden mt-2 rounded-2xl border border-slate-800 bg-slate-900/95 p-3 backdrop-blur">
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {appNavItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`rounded-xl px-3 py-2.5 text-sm font-medium text-center transition ${
                  isActiveHref(item.href)
                    ? "bg-orange-500/20 text-orange-200 border border-orange-500/30"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white border border-transparent"
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>
          {isReady && email && (
            <p className="mt-2 px-2 text-xs text-slate-600 truncate">{email}</p>
          )}
        </nav>
      )}
    </header>
  );
}

