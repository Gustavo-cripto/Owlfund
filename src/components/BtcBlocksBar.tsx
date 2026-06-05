"use client";

import { useEffect, useState, useRef } from "react";

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
const fmt = (n: number, d = 0) => n.toLocaleString("pt-PT", { maximumFractionDigits: d });

function timeAgo(ts: number) {
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min atrás`;
  return `${Math.floor(diff / 3600)}h atrás`;
}

function satsToBtc(sats: number) {
  return (sats / 1e8).toFixed(3);
}

function feeLabel(range: number[] | undefined) {
  if (!range || range.length < 2) return "–";
  const lo = Math.round(range[0]);
  const hi = Math.round(range[range.length - 1]);
  if (lo === hi) return `~${lo} sat/vB`;
  return `${lo} - ${hi} sat/vB`;
}

function blockColor(medianFee: number | undefined) {
  const f = medianFee ?? 1;
  if (f < 2)  return { bg: "bg-emerald-900/60",  border: "border-emerald-500/40",  text: "text-emerald-300" };
  if (f < 5)  return { bg: "bg-teal-900/60",     border: "border-teal-500/40",     text: "text-teal-300" };
  if (f < 15) return { bg: "bg-sky-900/60",      border: "border-sky-500/40",      text: "text-sky-300" };
  if (f < 30) return { bg: "bg-violet-900/60",   border: "border-violet-500/40",   text: "text-violet-300" };
  if (f < 60) return { bg: "bg-orange-900/60",   border: "border-orange-500/40",   text: "text-orange-300" };
  return       { bg: "bg-rose-900/60",           border: "border-rose-500/40",     text: "text-rose-300" };
}

function mempoolColor(i: number) {
  const palette = [
    { bg: "bg-emerald-900/50", border: "border-emerald-500/30", text: "text-emerald-300" },
    { bg: "bg-teal-900/50",    border: "border-teal-500/30",    text: "text-teal-300" },
    { bg: "bg-sky-900/50",     border: "border-sky-500/30",     text: "text-sky-300" },
  ];
  return palette[i % palette.length];
}

// ── Sub-components ─────────────────────────────────────────────────────────
function ConfirmedCard({ b }: { b: ConfirmedBlock }) {
  const col = blockColor(b.extras?.medianFee);
  const fees = b.extras?.totalFees ?? 0;
  const pool = b.extras?.pool?.name ?? "?";
  return (
    <div className={`shrink-0 w-[148px] rounded-xl border ${col.border} ${col.bg} px-3 py-2.5 flex flex-col gap-1 text-[11px] select-none`}>
      <div className="flex items-center justify-between">
        <span className={`font-bold text-xs ${col.text}`}>{fmt(b.height)}</span>
        <span className="text-slate-500 text-[10px]">{timeAgo(b.timestamp)}</span>
      </div>
      <div className="text-slate-400 text-[10px]">{feeLabel(b.extras?.feeRange)}</div>
      <div className="font-bold text-white text-sm leading-tight mt-0.5">{satsToBtc(fees)} BTC</div>
      <div className="text-slate-400">{fmt(b.tx_count)} txs</div>
      <div className="text-slate-500 text-[10px] truncate">{pool}</div>
    </div>
  );
}

function MempoolCard({ b, i, eta }: { b: MempoolBlock; i: number; eta: number }) {
  const col = mempoolColor(i);
  const etaMin = Math.round(eta / 60);
  return (
    <div className={`shrink-0 w-[148px] rounded-xl border ${col.border} ${col.bg} px-3 py-2.5 flex flex-col gap-1 text-[11px] select-none relative`}>
      <div className="flex items-center justify-between">
        <span className={`font-bold text-xs ${col.text}`}>Em ~{etaMin} min</span>
        <span className="text-[10px] text-slate-500 border border-slate-700 rounded px-1 py-0.5">MEMPOOL</span>
      </div>
      <div className="text-slate-400 text-[10px]">{feeLabel(b.feeRange)}</div>
      <div className="font-bold text-white text-sm leading-tight mt-0.5">{satsToBtc(b.totalFees)} BTC</div>
      <div className="text-slate-400">{fmt(b.nTx)} txs</div>
      <div className="text-slate-500 text-[10px]">~{Math.round(b.blockVSize / 1000)} kvB</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function BtcBlocksBar() {
  const [confirmed, setConfirmed] = useState<ConfirmedBlock[]>([]);
  const [mempool, setMempool] = useState<MempoolBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function fetchData() {
    try {
      const res = await fetch("/api/btc-blocks", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const data = (await res.json()) as { blocks: ConfirmedBlock[]; mempool: MempoolBlock[] };
      setConfirmed((data.blocks ?? []).slice(0, 8));
      setMempool((data.mempool ?? []).slice(0, 3));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 30_000);
    return () => clearInterval(id);
  }, []);

  // Scroll left/right
  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "right" ? 320 : -320, behavior: "smooth" });
  };

  return (
    <div className="border-b border-slate-800/60 bg-slate-900/30 select-none shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-2 pb-1">
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-400/80">₿ Blocos BTC</span>
        <span className="text-[10px] text-slate-600">ao vivo · mempool.space</span>
        <span className={`ml-1 h-1.5 w-1.5 rounded-full ${error ? "bg-rose-500" : "bg-emerald-500"} animate-pulse`} />
        <div className="ml-auto flex gap-1">
          <button type="button" onClick={() => scroll("left")}
            className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-white/5 transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button type="button" onClick={() => scroll("right")}
            className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-white/5 transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      </div>

      {/* Blocks row */}
      <div
        ref={scrollRef}
        className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[148px] h-[90px] rounded-xl border border-slate-800 bg-slate-900/40 animate-pulse" />
          ))
        ) : error ? (
          <p className="text-xs text-slate-500 py-4">Não foi possível carregar os blocos.</p>
        ) : (
          <>
            {/* Divider between mempool and confirmed */}
            {mempool.length > 0 && (
              <>
                {mempool.map((b, i) => (
                  <MempoolCard key={`m-${i}`} b={b} i={i} eta={(i + 1) * 600} />
                ))}
                <div className="shrink-0 flex flex-col items-center justify-center gap-1 px-1">
                  <div className="w-px h-12 bg-slate-700" />
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                  <div className="w-px h-6 bg-slate-700" />
                </div>
              </>
            )}
            {confirmed.map((b) => (
              <ConfirmedCard key={b.height} b={b} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
