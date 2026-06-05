"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    ),
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20M2 12h20" /><circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  {
    href: "/wallets",
    label: "Carteiras",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" />
        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z" />
      </svg>
    ),
  },
  {
    href: "/smart-money",
    label: "Smart Money",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    href: "/mercado",
    label: "Mercado",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" /><polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
  {
    href: "/fiscalidade",
    label: "Impostos",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    href: "/fire",
    label: "FIRE",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.4 0 2.5-1.1 2.5-2.5 0-1.8-2.5-5-2.5-5s-2.5 3.2-2.5 5Z" />
        <path d="M12 22c-4.4 0-8-3.6-8-8 0-5 4-10 8-12 4 2 8 7 8 12 0 4.4-3.6 8-8 8Z" />
      </svg>
    ),
  },
  {
    href: "/account",
    label: "Conta",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const supabase = createClient();
  const [email, setEmail] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

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

  return (
    <>
      {/* Mobile top bar */}
      <header className="xl:hidden flex items-center justify-between px-4 py-3 bg-black border-b border-white/[0.06]">
        <a href="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center overflow-hidden">
            <img src="/owlfund-owl.png" alt="Owlfund" className="w-7 h-7 object-cover rounded-md [transform:scaleX(-1)]" />
          </div>
          <div>
            <p className="text-sm font-bold text-white tracking-wide leading-none">OWLFUND</p>
            <p className="text-[10px] text-slate-500 leading-tight">Portfolio Analytics</p>
          </div>
        </a>
        <button
          type="button"
          onClick={() => setMobileOpen((o) => !o)}
          className="p-2 rounded-lg bg-white/5 border border-white/10"
          aria-label="Menu"
        >
          {mobileOpen ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
          )}
        </button>
      </header>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <nav className="xl:hidden bg-black border-b border-white/[0.06] px-3 py-3 grid grid-cols-2 gap-1">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                isActive(item.href)
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className={isActive(item.href) ? "text-orange-400" : "text-slate-500"}>
                {item.icon}
              </span>
              {item.label}
            </a>
          ))}
          <div className="col-span-2 mt-1 pt-2 border-t border-white/[0.06] flex items-center justify-between px-2">
            {email && <span className="text-xs text-slate-600 truncate max-w-[160px]">{email}</span>}
            {isLoggedIn && (
              <button type="button" onClick={handleLogout} className="text-xs text-slate-500 hover:text-white transition">
                Sair
              </button>
            )}
          </div>
        </nav>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden xl:flex flex-col w-60 shrink-0 min-h-screen bg-black border-r border-white/[0.06]">
        {/* Brand */}
        <div className="px-5 pt-7 pb-6">
          <a href="/dashboard" className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center overflow-hidden shrink-0 border border-white/[0.08]">
              <img src="/owlfund-owl.png" alt="Owlfund" className="w-14 h-14 object-cover rounded-2xl [transform:scaleX(-1)]" />
            </div>
            <div>
              <p className="text-base font-bold text-white tracking-widest leading-none">OWLFUND</p>
              <p className="text-xs text-slate-500 leading-tight mt-1">Portfolio Analytics</p>
            </div>
          </a>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 pb-4">
          <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Navigation
          </p>
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                    isActive(item.href)
                      ? "bg-white/10 text-white"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className={`shrink-0 ${isActive(item.href) ? "text-orange-400" : "text-slate-500"}`}>
                    {item.icon}
                  </span>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-white/[0.06]">
          {email && (
            <p className="text-[11px] text-slate-600 truncate mb-2">{email}</p>
          )}
          {isLoggedIn && (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-white/5 hover:text-white transition"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sair
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
