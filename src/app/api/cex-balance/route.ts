import { NextResponse } from "next/server";
import crypto from "crypto";

export interface CexBalance {
  asset: string;
  free: number;
  locked: number;
  total: number;
  usdValue?: number;
}

export interface CexBalanceResponse {
  exchange: string;
  balances: CexBalance[];
  error?: string;
}

// ── Binance ────────────────────────────────────────────────────────────────

async function fetchBinance(apiKey: string, apiSecret: string): Promise<CexBalance[]> {
  const ts = Date.now();
  const query = `timestamp=${ts}&recvWindow=10000`;
  const sig = crypto.createHmac("sha256", apiSecret).update(query).digest("hex");
  const url = `https://api.binance.com/api/v3/account?${query}&signature=${sig}`;
  const res = await fetch(url, { headers: { "X-MBX-APIKEY": apiKey } });
  if (res.status === 451) throw new Error("Binance bloqueou o acesso a partir dos servidores da app (restrição geográfica). Usa a Binance diretamente ou experimenta a Kraken/CoinEx.");
  if (!res.ok) throw new Error(`Binance: ${res.status}`);
  const data = await res.json() as { balances: { asset: string; free: string; locked: string }[] };
  return data.balances
    .map((b) => ({ asset: b.asset, free: parseFloat(b.free), locked: parseFloat(b.locked), total: parseFloat(b.free) + parseFloat(b.locked) }))
    .filter((b) => b.total > 0);
}

// ── Kraken ─────────────────────────────────────────────────────────────────

async function fetchKraken(apiKey: string, apiSecret: string): Promise<CexBalance[]> {
  const nonce = Date.now().toString();
  const path = "/0/private/Balance";
  const body = `nonce=${nonce}`;
  const msg = nonce + body;
  const secretBuf = Buffer.from(apiSecret, "base64");
  const hash = crypto.createHash("sha256").update(msg).digest();
  const hmacInput = Buffer.concat([Buffer.from(path), hash]);
  const sig = crypto.createHmac("sha512", secretBuf).update(hmacInput).digest("base64");
  const res = await fetch(`https://api.kraken.com${path}`, {
    method: "POST",
    headers: { "API-Key": apiKey, "API-Sign": sig, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Kraken: ${res.status}`);
  const data = await res.json() as { error: string[]; result: Record<string, string> };
  if (data.error?.length) throw new Error(`Kraken: ${data.error[0]}`);
  return Object.entries(data.result)
    .map(([asset, amount]) => ({ asset, free: parseFloat(amount), locked: 0, total: parseFloat(amount) }))
    .filter((b) => b.total > 0);
}

// ── CoinEx ─────────────────────────────────────────────────────────────────

async function fetchCoinEx(apiKey: string, apiSecret: string): Promise<CexBalance[]> {
  const key    = apiKey.replace(/[\s\r\n\t]/g, "");
  const secret = apiSecret.replace(/[\s\r\n\t]/g, "");

  const signAndFetch = async (signPath: string) => {
    const ts     = Date.now().toString();
    // CoinEx v2: METHOD + signedPath + body + timestamp (no separators)
    const toSign = "GET" + signPath + ts;
    const sig = crypto.createHmac("sha256", Buffer.from(secret, "utf-8"))
      .update(Buffer.from(toSign, "utf-8"))
      .digest("hex");
    return fetch("https://api.coinex.com/v2/assets/spot/balance", {
      headers: {
        "X-COINEX-KEY":       key,
        "X-COINEX-SIGN":      sig,
        "X-COINEX-TIMESTAMP": ts,
      },
      cache: "no-store",
    });
  };

  // Try short path first, then full path if signature fails
  let res = await signAndFetch("/assets/spot/balance");
  if (res.ok || res.status !== 200) {
    const d = await res.json() as { code: number; message?: string; data: { ccy: string; available: string; frozen: string }[] };
    if (d.code === 25) {
      // Retry with full path including /v2 prefix
      res = await signAndFetch("/v2/assets/spot/balance");
    } else if (d.code !== 0) {
      throw new Error(`CoinEx code ${d.code}: ${d.message ?? ""}`);
    } else {
      return (d.data ?? [])
        .map((b) => ({ asset: b.ccy, free: parseFloat(b.available), locked: parseFloat(b.frozen), total: parseFloat(b.available) + parseFloat(b.frozen) }))
        .filter((b) => b.total > 0);
    }
  }

  if (!res.ok) throw new Error(`CoinEx: ${res.status}`);
  const data = await res.json() as { code: number; message?: string; data: { ccy: string; available: string; frozen: string }[] };
  if (data.code !== 0) throw new Error(`CoinEx code ${data.code}: ${data.message ?? ""}`);
  return (data.data ?? [])
    .map((b) => ({ asset: b.ccy, free: parseFloat(b.available), locked: parseFloat(b.frozen), total: parseFloat(b.available) + parseFloat(b.frozen) }))
    .filter((b) => b.total > 0);
}

// ── OKX (MiCA · Malta) — precisa de passphrase ─────────────────────────────

async function fetchOkx(apiKey: string, apiSecret: string, passphrase: string): Promise<CexBalance[]> {
  const call = async (path: string) => {
    const ts = new Date().toISOString();
    const sig = crypto.createHmac("sha256", apiSecret).update(ts + "GET" + path).digest("base64");
    const res = await fetch(`https://www.okx.com${path}`, {
      headers: {
        "OK-ACCESS-KEY": apiKey,
        "OK-ACCESS-SIGN": sig,
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": passphrase,
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`OKX: ${res.status}`);
    return res.json() as Promise<{ code: string; msg?: string; data?: unknown[] }>;
  };

  const out = new Map<string, CexBalance>();
  const add = (asset: string, free: number, locked: number) => {
    const prev = out.get(asset) ?? { asset, free: 0, locked: 0, total: 0 };
    prev.free += free; prev.locked += locked; prev.total = prev.free + prev.locked;
    out.set(asset, prev);
  };

  // Conta de trading
  const trade = await call("/api/v5/account/balance");
  if (trade.code !== "0") throw new Error(`OKX: ${trade.msg ?? trade.code}`);
  const details = (trade.data?.[0] as { details?: { ccy: string; availBal: string; frozenBal: string }[] } | undefined)?.details ?? [];
  for (const d of details) add(d.ccy, parseFloat(d.availBal || "0"), parseFloat(d.frozenBal || "0"));

  // Conta de funding (best-effort)
  try {
    const fund = await call("/api/v5/asset/balances");
    if (fund.code === "0") {
      for (const d of (fund.data ?? []) as { ccy: string; availBal: string; frozenBal: string }[]) {
        add(d.ccy, parseFloat(d.availBal || "0"), parseFloat(d.frozenBal || "0"));
      }
    }
  } catch { /* funding opcional */ }

  return [...out.values()].filter((b) => b.total > 0);
}

// ── Bybit (MiCA · Áustria) ─────────────────────────────────────────────────

async function fetchBybit(apiKey: string, apiSecret: string): Promise<CexBalance[]> {
  const call = async (path: string, query: string) => {
    const ts = Date.now().toString();
    const recv = "10000";
    const sig = crypto.createHmac("sha256", apiSecret).update(ts + apiKey + recv + query).digest("hex");
    const res = await fetch(`https://api.bybit.com${path}?${query}`, {
      headers: {
        "X-BAPI-API-KEY": apiKey,
        "X-BAPI-TIMESTAMP": ts,
        "X-BAPI-RECV-WINDOW": recv,
        "X-BAPI-SIGN": sig,
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Bybit: ${res.status}`);
    return res.json() as Promise<{ retCode: number; retMsg?: string; result?: unknown }>;
  };

  const out = new Map<string, CexBalance>();
  const add = (asset: string, free: number, locked: number) => {
    const prev = out.get(asset) ?? { asset, free: 0, locked: 0, total: 0 };
    prev.free += free; prev.locked += locked; prev.total = prev.free + prev.locked;
    out.set(asset, prev);
  };

  const uni = await call("/v5/account/wallet-balance", "accountType=UNIFIED");
  if (uni.retCode !== 0) throw new Error(`Bybit: ${uni.retMsg ?? uni.retCode}`);
  const coins = ((uni.result as { list?: { coin?: { coin: string; walletBalance: string; locked: string }[] }[] })?.list?.[0]?.coin) ?? [];
  for (const c of coins) {
    const total = parseFloat(c.walletBalance || "0");
    const locked = parseFloat(c.locked || "0");
    add(c.coin, Math.max(0, total - locked), locked);
  }

  // Conta de funding (best-effort)
  try {
    const fund = await call("/v5/asset/transfer/query-account-coins-balance", "accountType=FUND");
    if (fund.retCode === 0) {
      const fc = ((fund.result as { balance?: { coin: string; walletBalance: string }[] })?.balance) ?? [];
      for (const c of fc) add(c.coin, parseFloat(c.walletBalance || "0"), 0);
    }
  } catch { /* opcional */ }

  return [...out.values()].filter((b) => b.total > 0);
}

// ── Crypto.com (MiCA · Malta) ──────────────────────────────────────────────

async function fetchCryptoCom(apiKey: string, apiSecret: string): Promise<CexBalance[]> {
  const id = Date.now();
  const nonce = Date.now();
  const method = "private/user-balance";
  const sigPayload = `${method}${id}${apiKey}${""}${nonce}`;
  const sig = crypto.createHmac("sha256", apiSecret).update(sigPayload).digest("hex");
  const res = await fetch("https://api.crypto.com/exchange/v1/private/user-balance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, method, api_key: apiKey, params: {}, nonce, sig }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Crypto.com: ${res.status}`);
  const data = await res.json() as { code: number; message?: string; result?: { data?: { position_balances?: { instrument_name: string; quantity: string }[] }[] } };
  if (data.code !== 0) throw new Error(`Crypto.com: ${data.message ?? data.code}`);
  const positions = data.result?.data?.[0]?.position_balances ?? [];
  return positions
    .map((b) => ({ asset: b.instrument_name, free: parseFloat(b.quantity || "0"), locked: 0, total: parseFloat(b.quantity || "0") }))
    .filter((b) => b.total > 0);
}

// ── Bitpanda (MiCA · Áustria) — só precisa da API key ──────────────────────

async function fetchBitpanda(apiKey: string): Promise<CexBalance[]> {
  const headers = { "X-Api-Key": apiKey.trim() };
  const out: CexBalance[] = [];

  const res = await fetch("https://api.bitpanda.com/v1/wallets", { headers, cache: "no-store" });
  if (res.status === 401) throw new Error("Bitpanda: chave inválida.");
  if (!res.ok) throw new Error(`Bitpanda: ${res.status}`);
  const data = await res.json() as { data?: { attributes?: { cryptocoin_symbol?: string; balance?: string } }[] };
  for (const w of data.data ?? []) {
    const sym = w.attributes?.cryptocoin_symbol;
    const bal = parseFloat(w.attributes?.balance ?? "0");
    if (sym && bal > 0) out.push({ asset: sym, free: bal, locked: 0, total: bal });
  }

  // Carteiras fiat (EUR etc.) — best-effort
  try {
    const fr = await fetch("https://api.bitpanda.com/v1/fiatwallets", { headers, cache: "no-store" });
    if (fr.ok) {
      const fd = await fr.json() as { data?: { attributes?: { fiat_symbol?: string; balance?: string } }[] };
      for (const w of fd.data ?? []) {
        const sym = w.attributes?.fiat_symbol;
        const bal = parseFloat(w.attributes?.balance ?? "0");
        if (sym && bal > 0) out.push({ asset: sym, free: bal, locked: 0, total: bal });
      }
    }
  } catch { /* opcional */ }

  return out;
}

// ── Route ──────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const body = await request.json() as { exchange: string; apiKey: string; apiSecret?: string; apiPassphrase?: string };
  const { exchange, apiKey, apiSecret, apiPassphrase } = body;

  // Bitpanda usa apenas API key; OKX exige passphrase além do secret.
  if (!exchange || !apiKey || (!apiSecret && exchange !== "bitpanda")) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (exchange === "okx" && !apiPassphrase) {
    return NextResponse.json({ error: "OKX precisa da passphrase da chave." }, { status: 400 });
  }

  try {
    let balances: CexBalance[] = [];
    if (exchange === "binance") balances = await fetchBinance(apiKey, apiSecret!);
    else if (exchange === "kraken") balances = await fetchKraken(apiKey, apiSecret!);
    else if (exchange === "coinex") balances = await fetchCoinEx(apiKey, apiSecret!);
    else if (exchange === "okx") balances = await fetchOkx(apiKey, apiSecret!, apiPassphrase!);
    else if (exchange === "bybit") balances = await fetchBybit(apiKey, apiSecret!);
    else if (exchange === "cryptocom") balances = await fetchCryptoCom(apiKey, apiSecret!);
    else if (exchange === "bitpanda") balances = await fetchBitpanda(apiKey);
    else return NextResponse.json({ error: "Unknown exchange" }, { status: 400 });

    return NextResponse.json({ exchange, balances } satisfies CexBalanceResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ exchange, balances: [], error: msg } satisfies CexBalanceResponse, { status: 502 });
  }
}
