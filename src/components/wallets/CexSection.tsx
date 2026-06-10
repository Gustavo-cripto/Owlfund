"use client";

import { useState, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────────

interface CexBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

interface CexAccount {
  id: string;
  exchange: "binance" | "kraken" | "coinex";
  label: string;
  apiKey: string;
  apiSecret: string;
  balances: CexBalance[];
  error?: string;
  loading: boolean;
}

interface HlBalance {
  coin: string;
  total: number;
  hold: number;
  free: number;
}

interface HlAccount {
  address: string;
  spotBalances: HlBalance[];
  perpValue: number;
  error?: string;
  loading: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const EXCHANGES = [
  { id: "binance", label: "Binance" },
  { id: "kraken", label: "Kraken" },
  { id: "coinex", label: "CoinEx" },
] as const;

function fmt(n: number) {
  if (n === 0) return "0";
  if (n < 0.001) return n.toExponential(2);
  return n.toLocaleString("pt-PT", { maximumFractionDigits: 6 });
}

// ── Ledger WebHID ──────────────────────────────────────────────────────────

interface HIDDeviceLike { productName?: string }
interface HIDLike { requestDevice(o: unknown): Promise<HIDDeviceLike[]> }

async function connectLedger(): Promise<string> {
  if (!("hid" in navigator)) throw new Error("WebHID não suportado neste browser. Usa Chrome ou Edge.");
  const hid = (navigator as unknown as { hid: HIDLike }).hid;
  const devices = await hid.requestDevice({ filters: [{ vendorId: 0x2c97 }] });
  if (!devices.length) throw new Error("Nenhum Ledger selecionado.");
  return devices[0].productName ?? "Ledger Device";
}

// ── CexSection ─────────────────────────────────────────────────────────────

const CEX_STORAGE_KEY = "cex-accounts-v1";
const HL_STORAGE_KEY = "hl-accounts-v1";

type StoredCex = { id: string; exchange: "binance" | "kraken" | "coinex"; label: string; apiKey: string; apiSecret: string };
type StoredHl = { address: string };

function loadStored<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[]; } catch { return []; }
}

function saveStored<T>(key: string, data: T[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
}

interface MarketPrice { priceUsd: number }

export default function CexSection({
  onTotalChange,
  prices = {},
  usdToEur = 0.92,
}: {
  onTotalChange?: (usd: number) => void;
  prices?: Record<string, MarketPrice>;
  usdToEur?: number;
}) {
  const [cexAccounts, setCexAccounts] = useState<CexAccount[]>([]);
  const [hlAccounts, setHlAccounts] = useState<HlAccount[]>([]);
  const [ledgerLabel, setLedgerLabel] = useState<string | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);

  // CEX add form
  const [showAddCex, setShowAddCex] = useState(false);
  const [newExchange, setNewExchange] = useState<"binance" | "kraken" | "coinex">("binance");
  const [newLabel, setNewLabel] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newSecret, setNewSecret] = useState("");

  // HL add form
  const [showAddHl, setShowAddHl] = useState(false);
  const [newHlAddress, setNewHlAddress] = useState("");

  // Load and re-fetch on mount
  useEffect(() => {
    const storedCex = loadStored<StoredCex>(CEX_STORAGE_KEY);
    const storedHl = loadStored<StoredHl>(HL_STORAGE_KEY);

    if (storedCex.length > 0) {
      setCexAccounts(storedCex.map((s) => ({ ...s, balances: [], loading: true })));
      storedCex.forEach((s) => {
        fetch("/api/cex-balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ exchange: s.exchange, apiKey: s.apiKey, apiSecret: s.apiSecret }),
        })
          .then((r) => r.json() as Promise<{ balances?: CexBalance[]; error?: string }>)
          .then((data) =>
            setCexAccounts((prev) =>
              prev.map((a) => a.id === s.id ? { ...a, loading: false, balances: data.balances ?? [], error: data.error } : a)
            )
          )
          .catch(() =>
            setCexAccounts((prev) =>
              prev.map((a) => a.id === s.id ? { ...a, loading: false, error: "Falha ao carregar" } : a)
            )
          );
      });
    }

    if (storedHl.length > 0) {
      setHlAccounts(storedHl.map((s) => ({ address: s.address, spotBalances: [], perpValue: 0, loading: true })));
      storedHl.forEach((s) => {
        fetch("/api/hyperliquid-balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: s.address }),
        })
          .then((r) => r.json() as Promise<{ spotBalances?: HlBalance[]; perpValue?: number; error?: string }>)
          .then((data) =>
            setHlAccounts((prev) =>
              prev.map((a) => a.address === s.address ? { ...a, loading: false, spotBalances: data.spotBalances ?? [], perpValue: data.perpValue ?? 0, error: data.error } : a)
            )
          )
          .catch(() =>
            setHlAccounts((prev) =>
              prev.map((a) => a.address === s.address ? { ...a, loading: false, error: "Falha ao carregar" } : a)
            )
          );
      });
    }
  }, []);

  // Save config to localStorage whenever accounts change (without transient state)
  useEffect(() => {
    saveStored<StoredCex>(CEX_STORAGE_KEY, cexAccounts.map(({ id, exchange, label, apiKey, apiSecret }) => ({ id, exchange, label, apiKey, apiSecret })));
  }, [cexAccounts]);

  useEffect(() => {
    saveStored<StoredHl>(HL_STORAGE_KEY, hlAccounts.map(({ address }) => ({ address })));
  }, [hlAccounts]);

  const accountUsd = (balances: CexBalance[]) =>
    balances.reduce((s, b) => s + b.total * (prices[b.asset]?.priceUsd ?? 0), 0);

  useEffect(() => {
    if (!onTotalChange) return;
    const cexUsd = cexAccounts.reduce((sum, a) => sum + accountUsd(a.balances), 0);
    const hlUsd = hlAccounts.reduce((sum, a) => {
      const spot = a.spotBalances.reduce((s, b) => s + (b.total ?? 0), 0);
      return sum + spot + (a.perpValue ?? 0);
    }, 0);
    onTotalChange(cexUsd + hlUsd);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cexAccounts, hlAccounts, onTotalChange, prices]);

  async function addCex() {
    if (!newKey || !newSecret) return;
    const id = crypto.randomUUID();
    const account: CexAccount = {
      id,
      exchange: newExchange,
      label: newLabel || EXCHANGES.find((e) => e.id === newExchange)!.label,
      apiKey: newKey,
      apiSecret: newSecret,
      balances: [],
      loading: true,
    };
    setCexAccounts((prev) => [...prev, account]);
    setShowAddCex(false);
    setNewKey(""); setNewSecret(""); setNewLabel("");

    const res = await fetch("/api/cex-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchange: newExchange, apiKey: newKey, apiSecret: newSecret }),
    });
    const data = await res.json() as { balances?: CexBalance[]; error?: string };
    setCexAccounts((prev) =>
      prev.map((a) => a.id === id ? { ...a, loading: false, balances: data.balances ?? [], error: data.error } : a)
    );
  }

  async function addHyperliquid() {
    const address = newHlAddress.trim();
    if (!address.startsWith("0x")) return;
    const account: HlAccount = { address, spotBalances: [], perpValue: 0, loading: true };
    setHlAccounts((prev) => [...prev, account]);
    setShowAddHl(false);
    setNewHlAddress("");

    const res = await fetch("/api/hyperliquid-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    });
    const data = await res.json() as { spotBalances?: HlBalance[]; perpValue?: number; error?: string };
    setHlAccounts((prev) =>
      prev.map((a) =>
        a.address === address
          ? { ...a, loading: false, spotBalances: data.spotBalances ?? [], perpValue: data.perpValue ?? 0, error: data.error }
          : a
      )
    );
  }

  async function handleLedger() {
    setLedgerError(null);
    try {
      const name = await connectLedger();
      setLedgerLabel(name);
    } catch (err) {
      setLedgerError(err instanceof Error ? err.message : "Erro desconhecido");
    }
  }

  return (
    <div className="space-y-6 mt-8">
      {/* ── CEX ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Exchanges Centralizadas</p>
            <p className="text-sm text-slate-300 mt-0.5">Binance · Kraken · CoinEx — via API Key (read-only)</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddCex((v) => !v)}
            className="rounded-xl bg-orange-500/90 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400 transition"
          >
            + Adicionar CEX
          </button>
        </div>

        {showAddCex && (
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
            <div className="flex gap-2 flex-wrap">
              {EXCHANGES.map((ex) => (
                <button
                  key={ex.id}
                  type="button"
                  onClick={() => setNewExchange(ex.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    newExchange === ex.id
                      ? "border-orange-400 bg-orange-500/20 text-orange-200"
                      : "border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {ex.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Label (opcional)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500"
            />
            <input
              type="text"
              placeholder={newExchange === "coinex" ? "Access ID (API Key)" : "API Key"}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
            />
            <input
              type="password"
              placeholder={newExchange === "coinex" ? "Secret Key" : "API Secret"}
              value={newSecret}
              onChange={(e) => setNewSecret(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
            />
            {newExchange === "coinex" && (
              <p className="text-[10px] text-orange-400">CoinEx: o campo "Access ID" é o que aparece como chave na página de API Keys. O "Secret Key" é a chave de assinatura.</p>
            )}
            <p className="text-[10px] text-slate-600">⚠️ Usa apenas chaves read-only. Nunca partilhes chaves com permissão de trade/withdrawal.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addCex}
                disabled={!newKey || !newSecret}
                className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400 disabled:opacity-40 transition"
              >
                Ligar
              </button>
              <button
                type="button"
                onClick={() => setShowAddCex(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:border-slate-500 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {cexAccounts.length === 0 && !showAddCex && (
          <p className="text-xs text-slate-600">Nenhuma exchange ligada ainda.</p>
        )}

        <div className="space-y-3">
          {cexAccounts.map((acc) => (
            <div key={acc.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-white">{acc.label}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">{acc.exchange}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCexAccounts((prev) => prev.filter((a) => a.id !== acc.id))}
                  className="text-xs text-slate-600 hover:text-rose-400 transition"
                >
                  Remover
                </button>
              </div>
              {acc.loading ? (
                <p className="text-xs text-slate-500 animate-pulse">A carregar saldos…</p>
              ) : acc.error ? (
                <p className="text-xs text-rose-400">{acc.error}</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {acc.balances.map((b) => (
                      <div key={b.asset} className="rounded-lg bg-slate-900 px-3 py-2 text-xs">
                        <p className="font-bold text-white">{b.asset}</p>
                        <p className="text-slate-400">{fmt(b.total)}</p>
                        {b.locked > 0 && <p className="text-[10px] text-slate-600">Locked: {fmt(b.locked)}</p>}
                      </div>
                    ))}
                  </div>
                  {acc.balances.length > 0 && (
                    <div className="mt-3 flex justify-end">
                      <span className="text-xs text-slate-500">Total: </span>
                      <span className="ml-1 text-sm font-semibold text-white">
                        {accountUsd(acc.balances) > 0
                          ? `€ ${(accountUsd(acc.balances) * usdToEur).toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Hyperliquid ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Hyperliquid</p>
            <p className="text-sm text-slate-300 mt-0.5">Spot + Perp — via endereço público (sem chave)</p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddHl((v) => !v)}
            className="rounded-xl bg-orange-500/90 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400 transition"
          >
            + Adicionar
          </button>
        </div>

        {showAddHl && (
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 p-4 space-y-3">
            <input
              type="text"
              placeholder="Endereço EVM (0x...)"
              value={newHlAddress}
              onChange={(e) => setNewHlAddress(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addHyperliquid}
                disabled={!newHlAddress.startsWith("0x")}
                className="rounded-lg bg-orange-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-orange-400 disabled:opacity-40 transition"
              >
                Carregar
              </button>
              <button
                type="button"
                onClick={() => setShowAddHl(false)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-400 hover:border-slate-500 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {hlAccounts.length === 0 && !showAddHl && (
          <p className="text-xs text-slate-600">Nenhuma conta Hyperliquid adicionada.</p>
        )}

        <div className="space-y-3">
          {hlAccounts.map((acc) => (
            <div key={acc.address} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-mono text-slate-400">{acc.address.slice(0, 10)}…{acc.address.slice(-6)}</p>
                <button
                  type="button"
                  onClick={() => setHlAccounts((prev) => prev.filter((a) => a.address !== acc.address))}
                  className="text-xs text-slate-600 hover:text-rose-400 transition"
                >
                  Remover
                </button>
              </div>
              {acc.loading ? (
                <p className="text-xs text-slate-500 animate-pulse">A carregar…</p>
              ) : acc.error ? (
                <p className="text-xs text-rose-400">{acc.error}</p>
              ) : (
                <div className="space-y-2">
                  {acc.perpValue > 0 && (
                    <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2 text-xs">
                      <p className="text-orange-300 font-semibold">Perp Account Value</p>
                      <p className="text-white font-bold">${acc.perpValue.toLocaleString("pt-PT", { minimumFractionDigits: 2 })}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {acc.spotBalances.map((b) => (
                      <div key={b.coin} className="rounded-lg bg-slate-900 px-3 py-2 text-xs">
                        <p className="font-bold text-white">{b.coin}</p>
                        <p className="text-slate-400">{fmt(b.total)}</p>
                      </div>
                    ))}
                  </div>
                  {acc.spotBalances.length === 0 && acc.perpValue === 0 && (
                    <p className="text-xs text-slate-600">Sem saldos encontrados.</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Ledger ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Hardware Wallet</p>
          <p className="text-sm text-slate-300 mt-0.5">Ledger / Trezor — via WebHID (Chrome/Edge)</p>
        </div>

        {ledgerLabel ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <span className="text-emerald-400 text-lg">🔐</span>
            <div>
              <p className="text-sm font-semibold text-emerald-300">{ledgerLabel} ligado</p>
              <p className="text-xs text-slate-400">Dispositivo detetado via WebHID</p>
            </div>
            <button
              type="button"
              onClick={() => setLedgerLabel(null)}
              className="ml-auto text-xs text-slate-600 hover:text-rose-400 transition"
            >
              Desligar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleLedger}
            className="flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm text-slate-300 hover:border-orange-500/50 hover:text-white transition"
          >
            <span>🔐</span>
            <span>Ligar Ledger / Trezor</span>
          </button>
        )}

        {ledgerError && (
          <p className="text-xs text-rose-400">{ledgerError}</p>
        )}

        <p className="text-[10px] text-slate-600">
          Requer Chrome ou Edge com WebHID. O dispositivo deve estar desbloqueado e com uma app aberta.
          Os saldos são lidos a partir do endereço público — nenhuma chave privada é acedida.
        </p>
      </div>
    </div>
  );
}
