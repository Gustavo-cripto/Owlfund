"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { Lang } from "@/lib/i18n/translations";

const LANGS: { code: Lang; flag: string; label: string }[] = [
  { code: "pt", flag: "🇵🇹", label: "PT" },
  { code: "en", flag: "🇬🇧", label: "EN" },
  { code: "es", flag: "🇪🇸", label: "ES" },
  { code: "fr", flag: "🇫🇷", label: "FR" },
];

const NAV_ITEMS_KEYS = [
  { href: "/dashboard",   labelKey: "nav_dashboard" },
  { href: "/portfolio",   labelKey: "nav_portfolio" },
  { href: "/wallets",     labelKey: "nav_wallets" },
  { href: "/smart-money", labelKey: "nav_smart_money" },
  { href: "/mercado",     labelKey: "nav_mercado" },
  { href: "/fiscalidade", labelKey: "nav_fiscalidade" },
  { href: "/fire",        labelKey: "nav_fire" },
  { href: "/pricing",     labelKey: "nav_pricing" },
  { href: "/account",     labelKey: "nav_account" },
] as const;

// Keep legacy constant for icon lookup
const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M2 12h20" /><circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  {
    href: "/wallets",
    label: "Carteiras",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    ),
  },
  {
    href: "/smart-money",
    label: "Smart Money",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    href: "/mercado",
    label: "Mercado",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    href: "/fiscalidade",
    label: "Impostos",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    href: "/fire",
    label: "FIRE",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.4 0 2.5-1.1 2.5-2.5 0-1.8-2.5-5-2.5-5s-2.5 3.2-2.5 5Z" />
        <path d="M12 22c-4.4 0-8-3.6-8-8 0-5 4-10 8-12 4 2 8 7 8 12 0 4.4-3.6 8-8 8Z" />
      </svg>
    ),
  },
  {
    href: "/pricing",
    label: "Planos",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
      </svg>
    ),
  },
  {
    href: "/account",
    label: "Conta",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const supabase = createClient();
  const { lang, setLang, t } = useLanguage();
  const [email, setEmail] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }: { data: { session: { user: { email?: string } } | null } }) => {
      if (!mounted) return;
      setIsLoggedIn(!!(data as { session: unknown }).session);
      setEmail((data.session as { user: { email?: string } } | null)?.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e: unknown, session: { user: { email?: string } } | null) => {
      setIsLoggedIn(!!session);
      setEmail(session?.user?.email ?? null);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(`${href}/`);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const handleMouseEnter = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setHovered(true);
  };
  const handleMouseLeave = () => {
    leaveTimer.current = setTimeout(() => setHovered(false), 200);
  };

  const expanded = hovered;

  return (
    <>
      {/* ── Mobile top bar ── */}
      <header className="xl:hidden flex items-center justify-between px-4 py-3 bg-black border-b border-white/[0.06]">
        <a href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0">
            <img src="/owlfund-owl.png" alt="Owlfund" className="w-10 h-10 object-cover [transform:scaleX(-1)]" />
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-widest leading-none">OWLFUND</p>
            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">Portfolio Analytics</p>
          </div>
        </a>
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="p-2 rounded-lg bg-white/5 border border-white/10"
          aria-label="Menu"
        >
          {mobileOpen
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          }
        </button>
      </header>

      {/* ── Mobile dropdown ── */}
      {mobileOpen && (
        <nav className="xl:hidden bg-black border-b border-white/[0.06] px-3 py-3 grid grid-cols-2 gap-1">
          {NAV_ITEMS_KEYS.map((item) => {
            const icon = NAV_ITEMS.find((n) => n.href === item.href)?.icon;
            return (
              <a key={item.href} href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  isActive(item.href) ? "bg-white/10 text-white" : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <span className={isActive(item.href) ? "text-orange-400" : "text-slate-500"}>{icon}</span>
                {t(item.labelKey)}
              </a>
            );
          })}
          <div className="col-span-2 mt-1 pt-2 border-t border-white/[0.06] flex items-center justify-between px-2">
            <div className="flex gap-1">
              {LANGS.map((l) => (
                <button key={l.code} type="button" onClick={() => setLang(l.code)}
                  className={`text-xs px-1.5 py-0.5 rounded transition ${lang === l.code ? "text-white bg-white/10" : "text-slate-500 hover:text-white"}`}
                >{l.flag} {l.label}</button>
              ))}
            </div>
            {isLoggedIn && (
              <button type="button" onClick={handleLogout} className="text-xs text-slate-500 hover:text-white transition">{t("logout")}</button>
            )}
          </div>
        </nav>
      )}

      {/* ── Desktop sidebar (hover to expand) ── */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`hidden xl:flex flex-col shrink-0 min-h-screen bg-black border-r border-white/[0.06] transition-all duration-300 ease-in-out z-40 ${
          expanded ? "w-64 shadow-2xl shadow-black/60" : "w-[72px]"
        }`}
      >
        {/* Brand */}
        <div className={`flex items-center border-b border-white/[0.06] overflow-hidden ${expanded ? "px-5 pt-8 pb-7 gap-4" : "justify-center px-0 py-5"}`}>
          <a href="/dashboard" className="shrink-0">
            <div className={`overflow-hidden border border-white/[0.08] transition-all duration-300 ${expanded ? "w-16 h-16 rounded-2xl" : "w-10 h-10 rounded-xl"}`}>
              <img src="/owlfund-owl.png" alt="Owlfund" className="w-full h-full object-cover [transform:scaleX(-1)]" />
            </div>
          </a>
          <div className={`transition-all duration-200 overflow-hidden ${expanded ? "opacity-100 w-auto" : "opacity-0 w-0"}`}>
            <a href="/dashboard">
              <p className="text-lg font-black text-white tracking-[0.22em] leading-none uppercase whitespace-nowrap">OWLFUND</p>
              <p className="text-xs text-slate-500 leading-tight mt-1 whitespace-nowrap">Portfolio Analytics</p>
            </a>
          </div>
        </div>

        {/* Nav */}
        <nav className={`flex-1 py-4 ${expanded ? "px-3" : "px-2"}`}>
          {expanded && (
            <p className="px-3 mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-600 whitespace-nowrap">
              Navigation
            </p>
          )}
          <ul className="space-y-1">
            {NAV_ITEMS_KEYS.map((item) => {
              const icon = NAV_ITEMS.find((n) => n.href === item.href)?.icon;
              const label = t(item.labelKey);
              return (
                <li key={item.href}>
                  <a
                    href={item.href}
                    title={!expanded ? label : undefined}
                    className={`flex items-center rounded-xl font-medium transition-all duration-150 ${
                      expanded ? "gap-3 px-3 py-3" : "justify-center px-0 py-3"
                    } ${
                      isActive(item.href)
                        ? "bg-white/10 text-white"
                        : "text-slate-400 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <span className={`shrink-0 ${isActive(item.href) ? "text-orange-400" : "text-slate-500"}`}>
                      {icon}
                    </span>
                    <span className={`transition-all duration-200 overflow-hidden whitespace-nowrap text-[15px] ${expanded ? "opacity-100 w-auto" : "opacity-0 w-0"}`}>
                      {label}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className={`border-t border-white/[0.06] ${expanded ? "px-4 py-4" : "px-2 py-4"}`}>
          {/* Language picker */}
          <div className={`flex mb-3 ${expanded ? "gap-1 px-1" : "flex-col gap-1 items-center"}`}>
            {LANGS.map((l) => (
              <button key={l.code} type="button" onClick={() => setLang(l.code)}
                title={l.label}
                className={`rounded-lg text-[11px] font-medium transition ${
                  expanded ? "px-2 py-1" : "w-8 h-7 flex items-center justify-center"
                } ${lang === l.code ? "bg-orange-500/20 text-orange-400" : "text-slate-600 hover:text-slate-300 hover:bg-white/5"}`}
              >
                {expanded ? `${l.flag} ${l.label}` : l.flag}
              </button>
            ))}
          </div>
          {expanded && email && (
            <p className="text-[11px] text-slate-600 truncate mb-2 px-1 whitespace-nowrap">{email}</p>
          )}
          {isLoggedIn && (
            <button
              type="button"
              onClick={handleLogout}
              title={!expanded ? t("logout") : undefined}
              className={`w-full flex items-center rounded-xl text-slate-500 hover:bg-white/5 hover:text-white transition ${
                expanded ? "gap-2.5 px-3 py-2.5" : "justify-center py-3 px-0"
              }`}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span className={`transition-all duration-200 overflow-hidden whitespace-nowrap text-sm ${expanded ? "opacity-100 w-auto" : "opacity-0 w-0"}`}>
                {t("logout")}
              </span>
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
