"use client";

import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import BtcBlocksBar from "./BtcBlocksBar";
import AccountSwitcher from "./AccountSwitcher";
import { ConfirmProvider } from "./ConfirmDialog";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";
import { createClient } from "@/lib/supabase/client";

// `priceUsd` porque e nisso que a fonte cota; a apresentacao converte para a
// moeda escolhida pelo utilizador.
type Tick = { symbol: string; priceUsd: number; change: string; up: boolean };

// Fallback estático (só até chegarem os preços reais de /api/markets).
const TICKER_DATA: Tick[] = [
  { symbol: "BTC", priceUsd: 91240.0, change: "+2,4%", up: true },
  { symbol: "ETH", priceUsd: 3180.0, change: "+1,8%", up: true },
  { symbol: "SOL", priceUsd: 148.0, change: "-0,6%", up: false },
  { symbol: "ADA", priceUsd: 0.42, change: "+3,1%", up: true },
  { symbol: "BNB", priceUsd: 548.0, change: "+0,9%", up: true },
  { symbol: "AAPL", priceUsd: 211.0, change: "+0,4%", up: true },
  { symbol: "NVDA", priceUsd: 876.0, change: "+1,2%", up: true },
  { symbol: "S&P 500", priceUsd: 5248.0, change: "-0,2%", up: false },
  { symbol: "DOGE", priceUsd: 0.138, change: "+5,2%", up: true },
  { symbol: "LINK", priceUsd: 13.4, change: "+1,1%", up: true },
  { symbol: "TSLA", priceUsd: 248.0, change: "-1,3%", up: false },
  { symbol: "GOLD", priceUsd: 2890.0, change: "+0,3%", up: true },
  { symbol: "XRP", priceUsd: 0.58, change: "+2,7%", up: true },
  { symbol: "DOT", priceUsd: 7.2, change: "-0,8%", up: false },
  { symbol: "AVAX", priceUsd: 34.5, change: "+1,5%", up: true },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { t: tr } = useLanguage();  // `t` esta ocupado pela variavel do map do ticker
  // A barra mostrava "€" no exemplo estatico e "$" assim que chegavam os dados
  // reais — no mesmo sitio, a mudar de moeda sozinha. Agora segue a escolhida.
  const { formatMarketUsd: fmtMkt } = useCurrencyFormat();
  const [ticks, setTicks] = useState<Tick[]>(TICKER_DATA);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/markets");
        if (!res.ok) return;
        const json = await res.json() as { data?: Array<{ symbol: string; priceUsd?: number | null; change24h?: number | null }> };
        const rows = (json.data ?? []).filter(r => typeof r.priceUsd === "number" && r.priceUsd > 0).slice(0, 15);
        if (cancelled || rows.length < 5) return;
        setTicks(rows.map(r => {
          const ch = typeof r.change24h === "number" ? r.change24h : 0;
          return { symbol: r.symbol.toUpperCase(), priceUsd: r.priceUsd as number, change: `${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%`, up: ch >= 0 };
        }));
        setLive(true);
      } catch { /* mantém o fallback */ }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Os blocos BTC sao para quem ja usa o site. Num telemovel, a um visitante
  // sem sessao (vem das redes, decide no primeiro ecra) ocupavam ~300 px antes
  // do titulo da landing — ficam so a partir de md ate haver sessao.
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let alive = true;
    try {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data }: { data: { session: unknown } }) => { if (alive) setHasSession(Boolean(data.session)); }).catch(() => {});
      const { data: sub } = supabase.auth.onAuthStateChange((_e: string, s: unknown) => { if (alive) setHasSession(Boolean(s)); });
      return () => { alive = false; sub.subscription.unsubscribe(); };
    } catch { return () => { alive = false; }; }
  }, []);

  return (
    <ConfirmProvider>
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col xl:flex-row xl:items-start">
      {/* Teclado/leitor de ecrã: saltar a navegação de uma vez (invisível até ter foco). */}
      <a href="#conteudo" className="skip-link">{tr("app_skip")}</a>
      <Sidebar />
      <div id="conteudo" tabIndex={-1} className="flex-1 min-w-0 flex flex-col min-h-screen outline-none">
        {/* ── Price ticker (real via /api/markets; fallback estático marcado como exemplo) ── */}
        <div className="ticker-wrap relative border-b border-slate-800/60 bg-slate-900/50 py-2 overflow-hidden select-none shrink-0" title={live ? tr("app_ticker_tip") : tr("app_ticker_demo_tip")}>
          {!live && <span className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded bg-slate-800 px-1.5 text-[9px] uppercase tracking-wider text-slate-300">{tr("app_ticker_demo")}</span>}
          <div className="flex animate-ticker" style={{ width: "max-content" }}>
            {[...ticks, ...ticks, ...ticks].map((tick, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 mx-6 text-xs font-mono whitespace-nowrap">
                <span className="font-bold text-slate-300 tracking-wide">{tick.symbol}</span>
                <span className="text-slate-500">{fmtMkt(tick.priceUsd, { decimals: tick.priceUsd >= 1000 ? 0 : tick.priceUsd >= 1 ? 2 : 4 })}</span>
                <span className={`font-semibold ${tick.up ? "text-emerald-400" : "text-rose-400"}`}>
                  {tick.change}
                </span>
                <span className="text-slate-700">·</span>
              </span>
            ))}
          </div>
        </div>

        {/* BTC live blocks */}
        <div className={hasSession ? "" : "hidden md:block"}>
          <BtcBlocksBar />
        </div>

        {/* Account / portfolio switcher (Pro/Premium) */}
        <div className="flex justify-end px-4 pt-2">
          <AccountSwitcher />
        </div>

        {/* Page content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
    </ConfirmProvider>
  );
}
