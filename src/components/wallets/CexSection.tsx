"use client";

import { useState, useEffect } from "react";
import { btnPrimary } from "@/lib/ui/buttons";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { useCurrencyFormat } from "@/lib/theme/ThemeContext";

// ── Types ──────────────────────────────────────────────────────────────────

interface CexBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

interface CexAccount {
  id: string;
  exchange: "binance" | "kraken" | "coinex" | "okx" | "bybit" | "cryptocom" | "bitpanda" | "coinbase";
  label: string;
  apiKey: string;
  apiSecret: string;
  apiPassphrase?: string;
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
  { id: "kraken", label: "Kraken", mica: true },
  { id: "coinbase", label: "Coinbase", mica: true },
  { id: "okx", label: "OKX", mica: true },
  { id: "bybit", label: "Bybit", mica: true },
  { id: "cryptocom", label: "Crypto.com", mica: true },
  { id: "bitpanda", label: "Bitpanda", mica: true },
  { id: "binance", label: "Binance", mica: false },
  { id: "coinex", label: "CoinEx", mica: false },
] as const;

function fmt(n: number) {
  if (n === 0) return "0";
  if (n < 0.001) return n.toExponential(2);
  return n.toLocaleString("pt-PT", { maximumFractionDigits: 6 });
}

// ── CexSection ─────────────────────────────────────────────────────────────

const CEX_STORAGE_KEY = "cex-accounts-v1";
const HL_STORAGE_KEY = "hl-accounts-v1";

type StoredCex = { id: string; exchange: "binance" | "kraken" | "coinex" | "okx" | "bybit" | "cryptocom" | "bitpanda" | "coinbase"; label: string; apiKey: string; apiSecret: string; apiPassphrase?: string };
type StoredHl = { address: string };

function loadStored<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[]; } catch { return []; }
}

function saveStored<T>(key: string, data: T[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(data)); } catch { /* ignore */ }
}

export default function CexSection({
  onTotalChange,
  usdToEur = 0.92,
  onAddColdWalletAddress,
  coldWalletNetworks = [],
  addedAddresses = [],
  onRemoveAddress,
  tokensByAddress = {},
}: {
  onTotalChange?: (usd: number) => void;
  usdToEur?: number;
  onAddColdWalletAddress?: (address: string, networkId: string, label?: string) => string | null;
  coldWalletNetworks?: Array<{ id: string; label: string; group?: string }>;
  addedAddresses?: Array<{
    address: string; networkLabel: string; kind: "eth" | "sol" | "btc" | "ada" | "other";
    balance?: string | null; symbol?: string; fiatUsd?: number | null;
    nftCount?: number | null; defiUsd?: number | null;
  }>;
  onRemoveAddress?: (address: string, kind: "eth" | "sol" | "btc" | "ada" | "other", networkLabel: string) => void;
  tokensByAddress?: Record<string, Array<{ address: string; symbol: string; name: string; logo?: string; balance: string; usdValue: number; chain: string }>>;
}) {
  const { t } = useLanguage();
  const { format: fmtCur, hideBalances } = useCurrencyFormat();
  const [coldAddress, setColdAddress] = useState("");
  const [coldNetwork, setColdNetwork] = useState("eth");
  const [coldError, setColdError] = useState<string | null>(null);
  const [coldSuccess, setColdSuccess] = useState<string | null>(null);
  const [coldShown, setColdShown] = useState<Record<string, boolean>>({});
  const [cexAccounts, setCexAccounts] = useState<CexAccount[]>([]);
  const [hlAccounts, setHlAccounts] = useState<HlAccount[]>([]);
  const [tokenPricesUsd, setTokenPricesUsd] = useState<Record<string, number>>({});

  // CEX add form
  const [showAddCex, setShowAddCex] = useState(false);
  const [newExchange, setNewExchange] = useState<"binance" | "kraken" | "coinex" | "okx" | "bybit" | "cryptocom" | "bitpanda" | "coinbase">("kraken");
  const [newPassphrase, setNewPassphrase] = useState("");
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
          body: JSON.stringify({ exchange: s.exchange, apiKey: s.apiKey, apiSecret: s.apiSecret, apiPassphrase: s.apiPassphrase }),
        })
          .then((r) => r.json() as Promise<{ balances?: CexBalance[]; error?: string }>)
          .then((data) =>
            setCexAccounts((prev) =>
              prev.map((a) => a.id === s.id ? { ...a, loading: false, balances: data.balances ?? [], error: data.error } : a)
            )
          )
          .catch(() =>
            setCexAccounts((prev) =>
              prev.map((a) => a.id === s.id ? { ...a, loading: false, error: t("cx_load_fail") } : a)
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
              prev.map((a) => a.address === s.address ? { ...a, loading: false, error: t("cx_load_fail") } : a)
            )
          );
      });
    }
  }, []);

  // Save config to localStorage whenever accounts change (without transient state)
  useEffect(() => {
    saveStored<StoredCex>(CEX_STORAGE_KEY, cexAccounts.map(({ id, exchange, label, apiKey, apiSecret, apiPassphrase }) => ({ id, exchange, label, apiKey, apiSecret, apiPassphrase })));
  }, [cexAccounts]);

  useEffect(() => {
    saveStored<StoredHl>(HL_STORAGE_KEY, hlAccounts.map(({ address }) => ({ address })));
  }, [hlAccounts]);

  // Fetch prices for all tokens via server-side proxy (avoids CORS)
  useEffect(() => {
    const allSymbols = Array.from(
      new Set(cexAccounts.flatMap((a) => a.balances.map((b) => b.asset)))
    );
    if (allSymbols.length === 0) return;

    fetch(`/api/token-prices?symbols=${allSymbols.join(",")}`)
      .then((r) => r.json())
      .then((d: { prices?: Record<string, number> }) => {
        if (d.prices) setTokenPricesUsd(d.prices);
      })
      .catch(() => {});
  }, [cexAccounts]);

  const refreshAccount = (acc: CexAccount) => {
    setCexAccounts((prev) => prev.map((a) => a.id === acc.id ? { ...a, loading: true, error: undefined } : a));
    fetch("/api/cex-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchange: acc.exchange, apiKey: acc.apiKey, apiSecret: acc.apiSecret, apiPassphrase: acc.apiPassphrase }),
    })
      .then((r) => r.json() as Promise<{ balances?: CexBalance[]; error?: string }>)
      .then((data) => setCexAccounts((prev) => prev.map((a) => a.id === acc.id ? { ...a, loading: false, balances: data.balances ?? [], error: data.error } : a)))
      .catch(() => setCexAccounts((prev) => prev.map((a) => a.id === acc.id ? { ...a, loading: false, error: t("cx_update_fail") } : a)));
  };

  const refreshHlAccount = (address: string) => {
    setHlAccounts((prev) => prev.map((a) => a.address === address ? { ...a, loading: true, error: undefined } : a));
    fetch("/api/hyperliquid-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    })
      .then((r) => r.json() as Promise<{ spotBalances?: HlBalance[]; perpValue?: number; error?: string }>)
      .then((data) => setHlAccounts((prev) => prev.map((a) => a.address === address ? { ...a, loading: false, spotBalances: data.spotBalances ?? [], perpValue: data.perpValue ?? 0, error: data.error } : a)))
      .catch(() => setHlAccounts((prev) => prev.map((a) => a.address === address ? { ...a, loading: false, error: t("cx_update_fail") } : a)));
  };

  const accountUsd = (balances: CexBalance[]) =>
    balances.reduce((s, b) => s + b.total * (tokenPricesUsd[b.asset] ?? 0), 0);

  useEffect(() => {
    if (!onTotalChange) return;
    const cexUsd = cexAccounts.reduce((sum, a) => sum + accountUsd(a.balances), 0);
    const hlUsd = hlAccounts.reduce((sum, a) => {
      const spot = a.spotBalances.reduce((s, b) => s + (b.total ?? 0), 0);
      return sum + spot + (a.perpValue ?? 0);
    }, 0);
    onTotalChange(cexUsd + hlUsd);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cexAccounts, hlAccounts, onTotalChange, tokenPricesUsd]);

  async function addCex() {
    if (!newKey || !newSecret) return;
    const id = crypto.randomUUID();
    const account: CexAccount = {
      id,
      exchange: newExchange,
      label: newLabel || EXCHANGES.find((e) => e.id === newExchange)!.label,
      apiPassphrase: newPassphrase || undefined,
      apiKey: newKey,
      apiSecret: newSecret,
      balances: [],
      loading: true,
    };
    setCexAccounts((prev) => [...prev, account]);
    setShowAddCex(false);
    setNewKey(""); setNewSecret(""); setNewLabel(""); setNewPassphrase("");

    const res = await fetch("/api/cex-balance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exchange: newExchange, apiKey: newKey, apiSecret: newSecret, apiPassphrase: newPassphrase || undefined }),
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

  return (
    <div className="space-y-6 mt-8">
      {/* ── CEX ── */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{t("cx_cex")}</p>
            <p className="text-sm text-slate-300 mt-0.5">Kraken · Coinbase · OKX · Bybit · Crypto.com · Bitpanda · Binance · CoinEx — via API Key (read-only)</p>
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
                  onClick={() => setNewExchange(ex.id as typeof newExchange)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    newExchange === ex.id
                      ? "border-orange-400 bg-orange-500/20 text-orange-200"
                      : "border-slate-700 text-slate-400 hover:border-slate-500"
                  }`}
                >
                  {ex.label}{ex.mica ? <span className="ml-1 text-[9px] text-emerald-400" title="Licenciada MiCA (UE)">🇪🇺</span> : null}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder={t("cx_label_opt")}
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500"
            />
            <input
              type="text"
              placeholder={newExchange === "coinex" ? "Access ID (API Key)" : newExchange === "coinbase" ? "organizations/…/apiKeys/… (API key name)" : "API Key"}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
            />
            {newExchange === "coinbase" ? (
              <textarea
                rows={4}
                placeholder={"-----BEGIN EC PRIVATE KEY-----\n…\n-----END EC PRIVATE KEY-----"}
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                spellCheck={false}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
              />
            ) : newExchange !== "bitpanda" && (
              <input
                type="password"
                placeholder={newExchange === "coinex" ? "Secret Key" : "API Secret"}
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
              />
            )}
            {newExchange === "okx" && (
              <input
                type="password"
                placeholder="Passphrase (definida ao criar a chave)"
                value={newPassphrase}
                onChange={(e) => setNewPassphrase(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-orange-500 font-mono"
              />
            )}
            {newExchange === "bitpanda" && (
              <p className="text-[10px] text-emerald-400">Bitpanda: basta a API key (não tem secret).</p>
            )}
            {newExchange === "coinbase" && (
              <p className="text-[10px] text-sky-300">Coinbase: cria uma chave em Developer Platform → API keys (permissão só <span className="font-mono">View</span>). Cola o <span className="font-mono">name</span> no campo da chave e a <span className="font-mono">privateKey</span> (PEM) no campo grande — o ficheiro JSON descarregado tem os dois.</p>
            )}
            {newExchange === "binance" && (
              <p className="text-[10px] text-amber-400">⚠️ A Binance não obteve licença MiCA e está a encerrar serviços na UE — considera uma exchange licenciada 🇪🇺.</p>
            )}
            {newExchange === "coinex" && (
              <p className="text-[10px] text-orange-400">CoinEx: o campo “Access ID” é o que aparece como chave na página de API Keys. O “Secret Key” é a chave de assinatura.</p>
            )}
            <details className="rounded-lg border border-sky-500/20 bg-sky-500/[0.05] px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-semibold text-sky-300">🔑 {t("cx_guide_title")}</summary>
              <ol className="mt-2 space-y-1 text-[11px] leading-relaxed text-slate-300">
                <li>1. {t("cx_guide_s1")}{" "}
                  <a target="_blank" rel="noopener noreferrer" className="text-sky-300 underline"
                    href={({ binance: "https://www.binance.com/en/my/settings/api-management", kraken: "https://pro.kraken.com/app/settings/api", coinex: "https://www.coinex.com/apikey", okx: "https://www.okx.com/account/my-api", bybit: "https://www.bybit.com/app/user/api-management", cryptocom: "https://crypto.com/exchange", bitpanda: "https://web.bitpanda.com/apikey", coinbase: "https://portal.cdp.coinbase.com/projects/api-keys" } as Record<string, string>)[newExchange]}>
                    {({ binance: "Binance → API Management", kraken: "Kraken → Settings → API", coinex: "CoinEx → API Keys", okx: "OKX → API keys", bybit: "Bybit → API Management", cryptocom: "Crypto.com Exchange → API Keys", bitpanda: "Bitpanda → API Key", coinbase: "Coinbase Developer Platform → API keys" } as Record<string, string>)[newExchange]}
                  </a>
                </li>
                <li>2. {t("cx_guide_s2")}</li>
                <li>3. {t("cx_guide_s3")} <span className="font-mono text-emerald-300">✓ Read</span> · <span className="font-mono text-rose-300">✗ Trade</span> · <span className="font-mono text-rose-300">✗ Withdraw</span></li>
                <li>4. {t("cx_guide_s4")}</li>
              </ol>
            </details>
            <p className="text-[10px] text-slate-600">⚠️ Usa apenas chaves read-only. Nunca partilhes chaves com permissão de trade/withdrawal.</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={addCex}
                disabled={!newKey || (newExchange !== "bitpanda" && !newSecret) || (newExchange === "okx" && !newPassphrase)}
                className={`${btnPrimary} px-4 py-2 text-xs`}
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
          <p className="text-xs text-slate-600">{t("cx_no_exchange")}</p>
        )}

        <div className="space-y-3">
          {cexAccounts.map((acc) => (
            <div key={acc.id} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-white">{acc.label}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wide">{acc.exchange}</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => refreshAccount(acc)}
                    disabled={acc.loading}
                    className="flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:border-orange-400/60 hover:text-orange-300 disabled:opacity-40 transition"
                    title={t("cx_refresh_bal")}
                  >
                    <span className={acc.loading ? "animate-spin" : ""}>↻</span>
                    {acc.loading ? "A atualizar…" : t("cx_refresh")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCexAccounts((prev) => prev.filter((a) => a.id !== acc.id))}
                    className="text-xs text-slate-600 hover:text-rose-400 transition"
                  >
                    Remover
                  </button>
                </div>
              </div>
              {acc.loading ? (
                <p className="text-xs text-slate-500 animate-pulse">{t("cx_loading_bal")}</p>
              ) : acc.error ? (
                <p className="text-xs text-rose-400">{acc.error}</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {acc.balances.map((b) => {
                      const priceUsd = tokenPricesUsd[b.asset];
                      const valueEur = priceUsd != null ? b.total * priceUsd * usdToEur : null;
                      return (
                        <div key={b.asset} className="rounded-lg bg-slate-900 px-3 py-2 text-xs">
                          <p className="font-bold text-white">{b.asset}</p>
                          <p className="text-slate-400">{hideBalances ? "••••" : fmt(b.total)}</p>
                          {valueEur != null && valueEur > 0.001 && (
                            <p className="text-[11px] text-emerald-400/80 mt-0.5">
                              {fmtCur(valueEur)}
                            </p>
                          )}
                          {b.locked > 0 && <p className="text-[10px] text-slate-600">Locked: {hideBalances ? "••••" : fmt(b.locked)}</p>}
                        </div>
                      );
                    })}
                  </div>
                  {acc.balances.length > 0 && (
                    <div className="mt-3 flex items-center justify-end gap-1.5">
                      <span className="text-xs text-slate-500">{t("cx_total")}</span>
                      <span className="text-sm font-bold text-white">
                        {accountUsd(acc.balances) > 0
                          ? fmtCur(accountUsd(acc.balances) * usdToEur)
                          : <span className="text-slate-600 animate-pulse text-xs">{t("cx_calculating")}</span>}
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
            <p className="text-sm text-slate-300 mt-0.5">{t("cx_hl_desc")}</p>
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
                className={`${btnPrimary} px-4 py-2 text-xs`}
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
          <p className="text-xs text-slate-600">{t("cx_no_hl")}</p>
        )}

        <div className="space-y-3">
          {hlAccounts.map((acc) => (
            <div key={acc.address} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-mono text-slate-400">{acc.address.slice(0, 10)}…{acc.address.slice(-6)}</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => refreshHlAccount(acc.address)}
                    disabled={acc.loading}
                    className="flex items-center gap-1 rounded-lg border border-slate-700 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:border-orange-400/60 hover:text-orange-300 disabled:opacity-40 transition"
                    title={t("cx_refresh_bal")}
                  >
                    <span className={acc.loading ? "animate-spin" : ""}>↻</span>
                    {acc.loading ? "A atualizar…" : t("cx_refresh")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setHlAccounts((prev) => prev.filter((a) => a.address !== acc.address))}
                    className="text-xs text-slate-600 hover:text-rose-400 transition"
                  >
                    Remover
                  </button>
                </div>
              </div>
              {acc.loading ? (
                <p className="text-xs text-slate-500 animate-pulse">{t("cx_updating_bal")}</p>
              ) : acc.error ? (
                <p className="text-xs text-rose-400">{acc.error}</p>
              ) : (
                <div className="space-y-2">
                  {acc.perpValue > 0 && (
                    <div className="rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2 text-xs">
                      <p className="text-orange-300 font-semibold">{t("cx_perp_value")}</p>
                      <p className="text-white font-bold">{fmtCur(acc.perpValue * usdToEur)}</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {acc.spotBalances.map((b) => {
                      const STABLES = new Set(["USDC", "USDT", "DAI", "BUSD", "USDE"]);
                      const priceUsd = STABLES.has(b.coin) ? 1 : (tokenPricesUsd[b.coin] ?? 0);
                      const valueEur = b.total > 0 && priceUsd > 0 ? b.total * priceUsd * usdToEur : null;
                      return (
                        <div key={b.coin} className="rounded-lg bg-slate-900 px-3 py-2 text-xs">
                          <p className="font-bold text-white">{b.coin}</p>
                          <p className="text-slate-400">{hideBalances ? "••••" : fmt(b.total)}</p>
                          {valueEur != null && valueEur > 0.001 && (
                            <p className="text-[11px] text-emerald-400/80 mt-0.5">
                              {fmtCur(valueEur)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {acc.spotBalances.length === 0 && acc.perpValue === 0 && (
                    <p className="text-xs text-slate-600">{t("cx_no_balances")}</p>
                  )}
                  {(() => {
                    const STABLES = new Set(["USDC", "USDT", "DAI", "BUSD", "USDE"]);
                    const spotUsd = acc.spotBalances.reduce((s, b) => {
                      const priceUsd = STABLES.has(b.coin) ? 1 : (tokenPricesUsd[b.coin] ?? 0);
                      return s + (b.total > 0 && priceUsd > 0 ? b.total * priceUsd : 0);
                    }, 0);
                    const totalUsd = acc.perpValue + spotUsd;
                    if (totalUsd <= 0) return null;
                    return (
                      <div className="mt-1 flex items-center justify-end gap-1.5 border-t border-slate-800 pt-2">
                        <span className="text-xs text-slate-500">{t("cx_total")}</span>
                        <span className="text-sm font-bold text-white">{fmtCur(totalUsd * usdToEur)}</span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Hardware Wallet (cold) — modo seguro read-only ── */}
      <div className="rounded-2xl border border-emerald-500/20 bg-slate-900/60 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🔐</span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">Ledger &amp; Trezor</p>
            <p className="text-sm text-slate-300 mt-0.5">{t("cx_cold_subtitle")}</p>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
          <p className="text-xs text-emerald-200/90 leading-relaxed">{t("cx_security_full")}</p>
        </div>

        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-slate-300">{t("cx_how_add")}</p>
          <div className="space-y-2 text-xs text-slate-400">
            <p><span className="text-emerald-400 font-semibold">1.</span> {t("cx_step1")}</p>
            <p><span className="text-emerald-400 font-semibold">2.</span> {t("cx_step2a")} <strong className="text-slate-200">{t("cx_receive")}</strong> {t("cx_step2b")}</p>
            <p><span className="text-emerald-400 font-semibold">3.</span> {t("cx_step3a")} <strong className="text-slate-200">{t("cx_add")}</strong></p>
          </div>
        </div>

        {/* Form inline: rede + endereço + adicionar */}
        <div className="space-y-2 pt-1">
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={coldNetwork}
              onChange={(e) => setColdNetwork(e.target.value)}
              className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-emerald-400 sm:w-[180px]"
            >
              {coldWalletNetworks.length > 0 ? (
                coldWalletNetworks.map((n) => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))
              ) : (
                <>
                  <option value="eth">Ethereum (ETH)</option>
                  <option value="btc">Bitcoin (BTC)</option>
                  <option value="sol">Solana (SOL)</option>
                  <option value="ada">Cardano (ADA)</option>
                </>
              )}
            </select>
            <input
              type="text"
              value={coldAddress}
              onChange={(e) => setColdAddress(e.target.value)}
              placeholder={t("cx_paste_addr")}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 outline-none focus:border-emerald-400"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setColdError(null);
              setColdSuccess(null);
              if (!onAddColdWalletAddress) { setColdError(t("cx_load_fail")); return; }
              const err = onAddColdWalletAddress(coldAddress, coldNetwork);
              if (err) { setColdError(err); return; }
              setColdSuccess("✓ " + t("cx_add_cold"));
              setColdAddress("");
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500/90 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-emerald-400 transition"
          >
            <span>📋</span>
            <span>{t("cx_add_cold")}</span>
          </button>
          {coldError && <p className="text-xs text-rose-400">{coldError}</p>}
          {coldSuccess && <p className="text-xs text-emerald-400">{coldSuccess}</p>}
        </div>

        <p className="text-[10px] text-slate-600 leading-relaxed">{t("cx_reads_auto")}</p>

        {/* Endereços adicionados — ver e remover */}
        {addedAddresses.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-300">{t("cx_added_addrs")} ({addedAddresses.length})</p>
            <div className="space-y-1.5">
              {addedAddresses.map((e) => {
                const key = `${e.kind}:${e.networkLabel}:${e.address}`;
                const shown = !!coldShown[key];
                // Distinguir os três estados. Um saldo de 0 é um valor válido (não é
                // "a carregar"), e uma consulta falhada grava "—" (Number → NaN).
                // Redes sem leitura de saldo vêm sem símbolo.
                const balanceNum = e.balance == null ? null : Number(e.balance);
                const balanceReady = balanceNum != null && Number.isFinite(balanceNum);
                const balanceUnavailable = !balanceReady && (e.balance != null || !e.symbol);
                const fmtUsd = (v: number) => hideBalances ? "••••" : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
                return (
                  <div key={key} className="rounded-xl border border-slate-700/60 bg-slate-950/40 px-3 py-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-300">{e.networkLabel}</span>
                      <span className="flex-1 truncate font-mono text-[11px] text-slate-400">
                        {shown ? e.address : <span className="tracking-widest text-slate-600 select-none">••••••••</span>}
                      </span>
                      <button
                        type="button"
                        onClick={() => setColdShown((prev) => ({ ...prev, [key]: !prev[key] }))}
                        className="rounded-full border border-slate-700 px-2 py-1 text-[10px] text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
                        title={shown ? t("cx_hide_addr") : t("cx_show_addr")}
                      >
                        {shown ? "🙈" : "👁"}
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveAddress?.(e.address, e.kind, e.networkLabel)}
                        className="rounded-full border border-rose-400/40 px-2.5 py-1 text-[10px] font-semibold text-rose-300 transition hover:border-rose-400 hover:text-white"
                      >
                        Remover
                      </button>
                    </div>
                    {/* Saldo · NFTs · DeFi */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-[11px]">
                      <span className="text-slate-400">
                        <span className="text-slate-500">{t("cx_balance")}</span>{" "}
                        {hideBalances ? (
                          <span className="font-semibold tracking-widest text-slate-500 select-none">••••</span>
                        ) : balanceReady ? (
                          <span className="font-semibold text-slate-200">
                            {balanceNum.toLocaleString("en-US", { maximumFractionDigits: 6 })} {e.symbol}
                            {e.fiatUsd != null ? <span className="text-slate-500"> ({fmtUsd(e.fiatUsd)})</span> : null}
                          </span>
                        ) : balanceUnavailable ? (
                          <span className="text-slate-600">—</span>
                        ) : (
                          <span className="text-slate-600">{t("cx_loading")}</span>
                        )}
                      </span>
                      <span className="text-slate-400">
                        <span className="text-slate-500">{t("cx_nfts")}</span>{" "}
                        <span className="font-semibold text-slate-200">{hideBalances ? "••••" : e.nftCount != null ? e.nftCount : "—"}</span>
                      </span>
                      <span className="text-slate-400">
                        <span className="text-slate-500">{t("cx_defi")}</span>{" "}
                        <span className="font-semibold text-emerald-300">{e.defiUsd != null ? fmtUsd(e.defiUsd) : "—"}</span>
                      </span>
                    </div>
                    {/* Tokens (wETH, USDC, etc.) — exclui o nativo já mostrado no Saldo */}
                    {(() => {
                      const toks = (tokensByAddress[`${e.kind}:${e.address}`] ?? [])
                        .filter((t) => t.address !== "native" && Number(t.balance) > 0)
                        .sort((a, b) => b.usdValue - a.usdValue);
                      if (toks.length === 0) return null;
                      return (
                        <div className="mt-1 space-y-1 rounded-lg border border-slate-800 bg-slate-900/40 px-2.5 py-2">
                          <p className="text-[10px] uppercase tracking-wider text-slate-500">{t("cx_tokens")} ({toks.length})</p>
                          {toks.map((t) => (
                            <div key={`${t.chain}:${t.address}:${t.symbol}`} className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="truncate text-slate-300">
                                {hideBalances ? "••••" : Number(t.balance).toLocaleString("en-US", { maximumFractionDigits: 4 })} <span className="font-semibold">{t.symbol}</span>
                              </span>
                              <span className="shrink-0 text-slate-400">{t.usdValue > 0 ? fmtUsd(t.usdValue) : "—"}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-700/60 bg-slate-950/40 px-4 py-3">
          <p className="text-[11px] text-slate-400 leading-relaxed">{t("cx_storage_note")}</p>
        </div>
      </div>
    </div>
  );
}
