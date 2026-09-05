"use client";

import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import BtcBlocksBar from "./BtcBlocksBar";
import AccountSwitcher from "./AccountSwitcher";

type Tick = { symbol: string; price: string; change: string; up: boolean };

// Fallback estático (só até chegarem os preços reais de /api/markets).
const TICKER_DATA: Tick[] = [
  { symbol: "BTC",    price: "€ 91.240", change: "+2,4%", up: true  },
  { symbol: "ETH",    price: "€ 3.180",  change: "+1,8%", up: true  },
  { symbol: "SOL",    price: "€ 148",    change: "-0,6%", up: false },
  { symbol: "ADA",    price: "€ 0,42",   change: "+3,1%", up: true  },
  { symbol: "BNB",    price: "€ 548",    change: "+0,9%", up: true  },
  { symbol: "AAPL",   price: "€ 211",    change: "+0,4%", up: true  },
  { symbol: "NVDA",   price: "€ 876",    change: "+1,2%", up: true  },
  { symbol: "S&P 500",price: "€ 5.248",  change: "-0,2%", up: false },
  { symbol: "DOGE",   price: "€ 0,138",  change: "+5,2%", up: true  },
  { symbol: "LINK",   price: "€ 13,40",  change: "+1,1%", up: true  },
  { symbol: "TSLA",   price: "€ 248",    change: "-1,3%", up: false },
  { symbol: "GOLD",   price: "€ 2.890",  change: "+0,3%", up: true  },
  { symbol: "XRP",    price: "€ 0,58",   change: "+2,7%", up: true  },
  { symbol: "DOT",    price: "€ 7,20",   change: "-0,8%", up: false },
  { symbol: "AVAX",   price: "€ 34,50",  change: "+1,5%", up: true  },
];

const fmtPrice = (v: number) =>
  v >= 1000 ? `$ ${v.toLocaleString("pt-PT", { maximumFractionDigits: 0 })}` : v >= 1 ? `$ ${v.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}` : `$ ${v.toLocaleString("pt-PT", { maximumFractionDigits: 4 })}`;

export default function AppShell({ children }: { children: React.ReactNode }) {
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
          return { symbol: r.symbol.toUpperCase(), price: fmtPrice(r.priceUsd as number), change: `${ch >= 0 ? "+" : ""}${ch.toFixed(1).replace(".", ",")}%`, up: ch >= 0 };
        }));
        setLive(true);
      } catch { /* mantém o fallback */ }
    };
    void load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col xl:flex-row xl:items-start">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        {/* ── Price ticker (real via /api/markets; fallback estático marcado como exemplo) ── */}
        <div className="relative border-b border-slate-800/60 bg-slate-900/50 py-2 overflow-hidden select-none shrink-0" title={live ? "CoinEx / CoinGecko · 24h" : "exemplo"}>
          {!live && <span className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded bg-slate-800 px-1.5 text-[9px] uppercase tracking-wider text-slate-500">demo</span>}
          <div className="flex animate-ticker" style={{ width: "max-content" }}>
            {[...ticks, ...ticks, ...ticks].map((t, i) => (
              <span key={i} className="inline-flex items-center gap-1.5 mx-6 text-xs font-mono whitespace-nowrap">
                <span className="font-bold text-slate-300 tracking-wide">{t.symbol}</span>
                <span className="text-slate-500">{t.price}</span>
                <span className={`font-semibold ${t.up ? "text-emerald-400" : "text-rose-400"}`}>
                  {t.change}
                </span>
                <span className="text-slate-700">·</span>
              </span>
            ))}
          </div>
        </div>

        {/* BTC live blocks */}
        <BtcBlocksBar />

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
  );
}
