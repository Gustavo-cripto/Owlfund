"use client";

import { useEffect, useState, useRef } from "react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

type T = (k: TranslationKey) => string;
const LOCALE_BY_LANG: Record<string, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };

// ── Types ──────────────────────────────────────────────────────────────────
type ConfirmedBlock = {
  height: number;
  timestamp: number;
  tx_count: number;
  size: number;
  extras?: {
    totalFees?: number;
    medianFee?: number;
    feeRange?: number[];
    pool?: { name?: string; slug?: string };
    reward?: number;
  };
};

type MempoolBlock = {
  blockSize: number;
  blockVSize: number;
  nTx: number;
  totalFees: number;
  medianFee: number;
  feeRange: number[];
};

// ── Helpers ────────────────────────────────────────────────────────────────
let fmtLocale = "pt-PT";
const fmtNum = (n: number) => n.toLocaleString(fmtLocale);

function timeAgo(ts: number, t: T) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return t("bb_ago_s").replace("{n}", String(diff));
  if (diff < 3600) return t("bb_ago_m").replace("{n}", String(Math.floor(diff / 60)));
  return t("bb_ago_h").replace("{n}", String(Math.floor(diff / 3600)));
}

function satsToBtc(sats: number) {
  return (sats / 1e8).toFixed(3);
}

function feeLabel(range: number[] | undefined, median?: number) {
  if (!range || range.length === 0) {
    if (median != null) return `~${Math.round(median)} sat/vB`;
    return "–";
  }
  const lo = Math.round(range[0]);
  const hi = Math.round(range[range.length - 1]);
  if (lo === hi || hi - lo < 2) return `~${lo} sat/vB`;
  return `${lo} - ${fmtNum(hi)} sat/vB`;
}

// Color by median fee (sat/vB)
function blockGradient(fee: number) {
  if (fee < 2)  return { from: "from-emerald-900", to: "to-emerald-950", border: "border-emerald-600/30", accent: "text-emerald-400", badge: "bg-emerald-500/20 text-emerald-300" };
  if (fee < 5)  return { from: "from-teal-900",    to: "to-teal-950",    border: "border-teal-600/30",    accent: "text-teal-400",    badge: "bg-teal-500/20 text-teal-300" };
  if (fee < 15) return { from: "from-sky-900",     to: "to-sky-950",     border: "border-sky-600/30",     accent: "text-sky-400",     badge: "bg-sky-500/20 text-sky-300" };
  if (fee < 30) return { from: "from-violet-900",  to: "to-violet-950",  border: "border-violet-600/30",  accent: "text-violet-400",  badge: "bg-violet-500/20 text-violet-300" };
  if (fee < 80) return { from: "from-orange-900",  to: "to-orange-950",  border: "border-orange-600/30",  accent: "text-orange-400",  badge: "bg-orange-500/20 text-orange-300" };
  return         { from: "from-rose-900",          to: "to-rose-950",    border: "border-rose-600/30",    accent: "text-rose-400",    badge: "bg-rose-500/20 text-rose-300" };
}

// Pool icon (emoji fallback)
function poolIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("antpool"))    return "🐜";
  if (n.includes("f2pool"))     return "🐟";
  if (n.includes("mara") || n.includes("marathon")) return "Ⓜ️";
  if (n.includes("foundry"))    return "⚒️";
  if (n.includes("viabtc"))     return "🔷";
  if (n.includes("luxor"))      return "💡";
  if (n.includes("spider"))     return "🕷️";
  if (n.includes("binance"))    return "🟡";
  if (n.includes("poolin"))     return "🔵";
  if (n.includes("slush") || n.includes("braiins")) return "🧊";
  if (n.includes("bip110"))     return "⚙️";
  return "⬡";
}

// ── Confirmed Block Card ────────────────────────────────────────────────────
function ConfirmedCard({ b }: { b: ConfirmedBlock }) {
  const { t } = useLanguage();
  const fees = b.extras?.totalFees ?? 0;
  const median = b.extras?.medianFee ?? 1;
  const pool = b.extras?.pool?.name ?? t("bb_unknown_pool");
  const col = blockGradient(median);

  return (
    <a
      href={`https://mempool.space/block/${b.height}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`shrink-0 w-[168px] rounded-2xl border ${col.border} bg-gradient-to-b ${col.from} ${col.to} p-3 flex flex-col gap-1.5 select-none hover:brightness-110 transition-all duration-150 cursor-pointer`}
    >
      {/* Block height — destaque */}
      <div className="flex items-center justify-between">
        <span className={`font-black text-base tracking-tight ${col.accent}`}>
          {fmtNum(b.height)}
        </span>
        <span className="text-[10px] text-slate-500">{timeAgo(b.timestamp, t)}</span>
      </div>

      {/* Fee range */}
      <div className={`text-[11px] font-medium ${col.badge.split(" ")[1]} leading-tight`}>
        {feeLabel(b.extras?.feeRange, median)}
      </div>

      {/* Fees BTC — destaque */}
      <div className="font-bold text-white text-[15px] leading-none mt-0.5">
        {satsToBtc(fees)} <span className="text-[11px] text-slate-400 font-normal">BTC</span>
      </div>

      {/* Tx count */}
      <div className="text-[11px] text-slate-400">
        {fmtNum(b.tx_count)} {t("bb_txs")}
      </div>

      {/* Pool */}
      <div className="flex items-center gap-1.5 mt-auto pt-1 border-t border-white/5">
        <span className="text-[13px]">{poolIcon(pool)}</span>
        <span className="text-[11px] text-slate-400 truncate">{pool}</span>
      </div>
    </a>
  );
}

// ── Mempool Block Card ──────────────────────────────────────────────────────
function MempoolCard({ b, i }: { b: MempoolBlock; i: number }) {
  const { t } = useLanguage();
  const median = b.medianFee ?? 1;
  const col = blockGradient(median);
  const etaMin = (i + 1) * 10;
  const fill = Math.min(100, Math.round((b.blockVSize / 1_000_000) * 100));

  return (
    <div className={`shrink-0 w-[168px] rounded-2xl border ${col.border} bg-gradient-to-b from-slate-900 to-slate-950 p-3 flex flex-col gap-1.5 select-none relative overflow-hidden`}>
      {/* Fill indicator bar */}
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-800">
        <div className={`h-full ${col.from.replace("from-", "bg-")} opacity-60 transition-all`} style={{ width: `${fill}%` }} />
      </div>

      {/* ETA */}
      <div className="flex items-center justify-between">
        <span className={`font-bold text-[11px] ${col.accent}`}>{t("bb_eta").replace("{n}", String(etaMin))}</span>
        <span className="text-[10px] text-slate-600 border border-slate-700 rounded px-1 py-0.5">{t("bb_next")}</span>
      </div>

      {/* Fee range */}
      <div className={`text-[11px] font-medium ${col.badge.split(" ")[1]} leading-tight`}>
        {feeLabel(b.feeRange, median)}
      </div>

      {/* Fees BTC */}
      <div className="font-bold text-white text-[15px] leading-none mt-0.5">
        {satsToBtc(b.totalFees)} <span className="text-[11px] text-slate-400 font-normal">BTC</span>
      </div>

      {/* Tx count */}
      <div className="text-[11px] text-slate-400">{fmtNum(b.nTx)} {t("bb_txs")}</div>

      {/* Size */}
      <div className="flex items-center gap-1.5 mt-auto pt-1 border-t border-white/5">
        <span className="text-[11px] text-slate-500">~{Math.round(b.blockVSize / 1000)} kvB</span>
        <span className="text-[11px] text-slate-600">·</span>
        <span className="text-[11px] text-slate-500">{fill}% {t("bb_full")}</span>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function BtcBlocksBar() {
  const { t, lang } = useLanguage();
  fmtLocale = LOCALE_BY_LANG[lang] ?? "pt-PT";
  const [confirmed, setConfirmed] = useState<ConfirmedBlock[]>([]);
  const [mempool, setMempool] = useState<MempoolBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const aliveRef = useRef(true);

  async function fetchData() {
    try {
      const res = await fetch("/api/btc-blocks", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { blocks: ConfirmedBlock[]; mempool: MempoolBlock[] };
      if (!aliveRef.current) return;
      setConfirmed((data.blocks ?? []).slice(0, 8));
      setMempool((data.mempool ?? []).slice(0, 3));
      setError(false);
    } catch {
      if (aliveRef.current) setError(true);
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  }

  // Polling de 30 s só com a tab visível (poupa pedidos em separadores em fundo).
  useEffect(() => {
    aliveRef.current = true;
    fetchData();
    const tick = () => { if (!document.hidden) void fetchData(); };
    const id = setInterval(tick, 30_000);
    const onVis = () => { if (!document.hidden) void fetchData(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { aliveRef.current = false; clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "right" ? 380 : -380, behavior: "smooth" });
  };

  return (
    <div className="keep-dark border-b border-slate-800/60 bg-slate-950/50 select-none shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-2.5 pb-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-orange-400/90">₿ {t("bb_title")}</span>
        <span className="text-[10px] text-slate-600">{t("bb_live")} · mempool.space</span>
        <span className={`ml-1 h-1.5 w-1.5 rounded-full ${error ? "bg-rose-500" : "bg-emerald-500"} animate-pulse`} />
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={() => scroll("left")} aria-label="←"
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button type="button" onClick={() => scroll("right")} aria-label="→"
            className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-white/5 transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>

      {/* Blocks row */}
      <div
        ref={scrollRef}
        className="flex gap-2.5 px-4 pb-3.5 overflow-x-auto"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[168px] h-[130px] rounded-2xl border border-slate-800 bg-slate-900/40 animate-pulse" />
          ))
        ) : error ? (
          <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
            <span className="text-rose-400">⚠</span>
            {t("bb_error")}
            <button type="button" onClick={fetchData} className="text-orange-400 hover:text-orange-300 underline">{t("gz_retry")}</button>
          </div>
        ) : (
          <>
            {/* Mempool blocks (próximos) */}
            {mempool.map((b, i) => (
              <MempoolCard key={`m-${i}`} b={b} i={i} />
            ))}

            {/* Divider */}
            {mempool.length > 0 && (
              <div className="shrink-0 flex flex-col items-center justify-center gap-1 px-0.5 py-2">
                <div className="w-px flex-1 bg-gradient-to-b from-transparent via-slate-700 to-transparent" />
                <div className="flex flex-col items-center gap-0.5">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                  <span className="text-[8px] text-slate-700 rotate-90 whitespace-nowrap" style={{ writingMode: "vertical-rl" }}>{t("bb_confirmed")}</span>
                </div>
                <div className="w-px flex-1 bg-gradient-to-b from-transparent via-slate-700 to-transparent" />
              </div>
            )}

            {/* Confirmed blocks */}
            {confirmed.map((b) => (
              <ConfirmedCard key={b.height} b={b} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
