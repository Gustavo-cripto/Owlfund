"use client";

import { useEffect, useRef, useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useRequireAuth } from "@/lib/auth/useRequireAuth";

const STORAGE_KEY = "smart-money-watchlist";

type WatchEntry = {
  address: string;
  label: string;
  chain: "eth" | "sol";
  addedAt: number;
};

type TokenBalance = {
  address: string;
  symbol: string;
  name: string;
  logo?: string;
  balance: string;
  usdValue: number;
  usdPrice: number;
};

type WalletData = {
  tokens: TokenBalance[];
  totalUsd: number;
  loading: boolean;
  error: string | null;
};

const KNOWN_WHALES: WatchEntry[] = [
  { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", label: "vitalik.eth", chain: "eth", addedAt: 0 },
  { address: "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7as5", label: "Solana Foundation", chain: "sol", addedAt: 0 },
];

function loadWatchlist(): WatchEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WatchEntry[]) : [];
  } catch {
    return [];
  }
}

function saveWatchlist(list: WatchEntry[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
}

function shortAddr(addr: string) {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatUsd(v: number) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(2)}`;
}

export default function SmartMoneyPage() {
  const { isLoading } = useRequireAuth("/login");
  const [watchlist, setWatchlist] = useState<WatchEntry[]>([]);
  const [walletData, setWalletData] = useState<Record<string, WalletData>>({});
  const [newAddress, setNewAddress] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newChain, setNewChain] = useState<"eth" | "sol">("eth");
  const [addError, setAddError] = useState<string | null>(null);
  const [showKnown, setShowKnown] = useState(false);
  const hydratedRef = useRef(false);

  useEffect(() => {
    const list = loadWatchlist();
    setWatchlist(list);
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveWatchlist(watchlist);
  }, [watchlist]);

  const fetchWalletData = async (entry: WatchEntry) => {
    const key = entry.address;
    setWalletData((prev) => ({
      ...prev,
      [key]: { tokens: [], totalUsd: 0, loading: true, error: null },
    }));
    try {
      const res = await fetch(
        `/api/token-balances?address=${encodeURIComponent(entry.address)}&chain=${entry.chain}`
      );
      const data = (await res.json()) as { tokens?: TokenBalance[]; totalUsd?: number; error?: string };
      if (!res.ok || data.error) {
        setWalletData((prev) => ({
          ...prev,
          [key]: { tokens: [], totalUsd: 0, loading: false, error: data.error ?? "Falha ao carregar." },
        }));
        return;
      }
      setWalletData((prev) => ({
        ...prev,
        [key]: { tokens: data.tokens ?? [], totalUsd: data.totalUsd ?? 0, loading: false, error: null },
      }));
    } catch (e) {
      setWalletData((prev) => ({
        ...prev,
        [key]: { tokens: [], totalUsd: 0, loading: false, error: e instanceof Error ? e.message : "Erro." },
      }));
    }
  };

  useEffect(() => {
    watchlist.forEach((entry) => {
      if (!walletData[entry.address]) {
        fetchWalletData(entry);
      }
    });
  }, [watchlist]);

  const handleAdd = () => {
    setAddError(null);
    const addr = newAddress.trim();
    if (!addr) { setAddError("Insere um endereço."); return; }
    const isEvm = /^0x[a-fA-F0-9]{40}$/.test(addr);
    const isSol = addr.length >= 32 && addr.length <= 44 && !addr.startsWith("0x");
    if (newChain === "eth" && !isEvm) { setAddError("Endereço EVM inválido (deve começar com 0x)."); return; }
    if (newChain === "sol" && !isSol) { setAddError("Endereço Solana inválido."); return; }
    if (watchlist.some((e) => e.address.toLowerCase() === addr.toLowerCase())) {
      setAddError("Endereço já na watchlist."); return;
    }
    const entry: WatchEntry = {
      address: addr,
      label: newLabel.trim() || shortAddr(addr),
      chain: newChain,
      addedAt: Date.now(),
    };
    setWatchlist((prev) => [entry, ...prev]);
    setNewAddress("");
    setNewLabel("");
  };

  const handleRemove = (address: string) => {
    setWatchlist((prev) => prev.filter((e) => e.address !== address));
    setWalletData((prev) => {
      const next = { ...prev };
      delete next[address];
      return next;
    });
  };

  const handleAddKnown = (entry: WatchEntry) => {
    if (watchlist.some((e) => e.address === entry.address)) return;
    setWatchlist((prev) => [{ ...entry, addedAt: Date.now() }, ...prev]);
    setShowKnown(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-sm text-slate-400 animate-pulse">A carregar...</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full bg-orange-500/6 blur-[100px]" />
      </div>

      <div className="relative z-10">
        <AppHeader variant="app" subtitle="Smart Money" />

        <main className="mx-auto w-full max-w-5xl px-6 pb-24 pt-6 space-y-8">

          {/* Header */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-orange-300/80">Rastreamento</p>
            <h1 className="mt-2 text-2xl font-bold text-white">Smart Money</h1>
            <p className="mt-1 text-sm text-slate-400">
              Acompanha carteiras de baleias, fundos e traders profissionais em tempo real.
            </p>
          </div>

          {/* Adicionar endereço */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Adicionar à watchlist</p>
            <div className="flex flex-wrap gap-3">
              {/* Chain selector */}
              <select
                value={newChain}
                onChange={(e) => setNewChain(e.target.value as "eth" | "sol")}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500"
              >
                <option value="eth">EVM (ETH/Polygon/…)</option>
                <option value="sol">Solana</option>
              </select>
              <input
                type="text"
                placeholder={newChain === "eth" ? "0x… endereço EVM" : "Endereço Solana base58"}
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                className="flex-1 min-w-[220px] rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
              <input
                type="text"
                placeholder="Nome / etiqueta (opcional)"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-48 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
              />
              <button
                onClick={handleAdd}
                className="rounded-xl bg-orange-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-orange-400 transition"
              >
                + Adicionar
              </button>
              <button
                onClick={() => setShowKnown((v) => !v)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-orange-400/40 hover:text-orange-200 transition"
              >
                Exemplos conhecidos
              </button>
            </div>
            {addError && <p className="text-xs text-rose-400">{addError}</p>}

            {showKnown && (
              <div className="mt-2 rounded-xl border border-slate-700 bg-slate-800/80 p-4 space-y-2">
                <p className="text-xs text-slate-400 mb-3">Clica para adicionar:</p>
                {KNOWN_WHALES.map((w) => (
                  <button
                    key={w.address}
                    onClick={() => handleAddKnown(w)}
                    disabled={watchlist.some((e) => e.address === w.address)}
                    className="w-full flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-4 py-2.5 text-left hover:border-orange-400/40 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    <div>
                      <span className="text-sm font-semibold text-white">{w.label}</span>
                      <span className="ml-2 text-xs text-slate-500 font-mono">{shortAddr(w.address)}</span>
                    </div>
                    <span className="text-xs rounded-full border border-slate-600 px-2 py-0.5 text-slate-400">
                      {w.chain.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Watchlist vazia */}
          {watchlist.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
              <p className="text-3xl mb-3">🕵️</p>
              <p className="text-sm font-semibold text-white">Watchlist vazia</p>
              <p className="mt-1 text-xs text-slate-400">Adiciona endereços de baleias ou traders para os rastrear.</p>
            </div>
          )}

          {/* Cards das carteiras */}
          <div className="space-y-5">
            {watchlist.map((entry) => {
              const data = walletData[entry.address];
              return (
                <div key={entry.address} className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 text-sm font-bold">
                        {entry.label.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">{entry.label}</p>
                        <p className="text-xs text-slate-500 font-mono">{shortAddr(entry.address)}</p>
                      </div>
                      <span className="ml-2 text-xs rounded-full border border-slate-700 px-2 py-0.5 text-slate-400">
                        {entry.chain.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {data && !data.loading && !data.error && (
                        <span className="text-sm font-bold text-emerald-400">
                          {formatUsd(data.totalUsd)}
                        </span>
                      )}
                      <button
                        onClick={() => fetchWalletData(entry)}
                        className="text-xs text-slate-400 hover:text-orange-300 transition px-2 py-1 rounded-lg hover:bg-slate-800"
                        title="Atualizar"
                      >
                        ↻
                      </button>
                      <button
                        onClick={() => handleRemove(entry.address)}
                        className="text-xs text-slate-500 hover:text-rose-400 transition px-2 py-1 rounded-lg hover:bg-slate-800"
                        title="Remover"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="px-6 py-4">
                    {!data || data.loading ? (
                      <p className="text-xs text-slate-400 animate-pulse py-4 text-center">A carregar tokens...</p>
                    ) : data.error ? (
                      <p className="text-xs text-rose-400 py-2">{data.error}</p>
                    ) : data.tokens.length === 0 ? (
                      <p className="text-xs text-slate-500 py-2">Nenhum token com valor encontrado.</p>
                    ) : (
                      <div className="space-y-1">
                        {data.tokens.slice(0, 15).map((token) => (
                          <div key={token.address + token.symbol} className="flex items-center justify-between py-1.5 border-b border-slate-800/60 last:border-0">
                            <div className="flex items-center gap-2.5">
                              {token.logo ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={token.logo} alt={token.symbol} className="h-5 w-5 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              ) : (
                                <div className="h-5 w-5 rounded-full bg-slate-700 flex items-center justify-center text-[9px] text-slate-400">
                                  {token.symbol.slice(0, 2)}
                                </div>
                              )}
                              <div>
                                <span className="text-sm font-semibold text-white">{token.symbol}</span>
                                <span className="ml-2 text-xs text-slate-500">{token.name}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-emerald-400">{formatUsd(token.usdValue)}</p>
                              {token.usdPrice > 0 && (
                                <p className="text-xs text-slate-500">@ {formatUsd(token.usdPrice)}</p>
                              )}
                            </div>
                          </div>
                        ))}
                        {data.tokens.length > 15 && (
                          <p className="text-xs text-slate-500 pt-2 text-center">
                            + {data.tokens.length - 15} tokens adicionais
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </main>
      </div>
    </div>
  );
}
