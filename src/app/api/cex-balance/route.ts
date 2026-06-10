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
  // Strip any invisible whitespace/BOM that copy-paste may introduce
  const key    = apiKey.replace(/\s/g, "");
  const secret = apiSecret.replace(/\s/g, "");
  const ts     = Date.now().toString();
  const path   = "/assets/spot/balance";
  // CoinEx v2 signature: METHOD + RequestPath + RequestBody + Timestamp (no separators)
  const toSign = "GET" + path + "" + ts;
  const sig = crypto.createHmac("sha256", Buffer.from(secret, "utf-8"))
    .update(Buffer.from(toSign, "utf-8"))
    .digest("hex");
  const res = await fetch(`https://api.coinex.com/v2${path}`, {
    method: "GET",
    headers: {
      "Content-Type":       "application/json",
      "X-COINEX-KEY":       key,
      "X-COINEX-SIGN":      sig,
      "X-COINEX-TIMESTAMP": ts,
    },
  });
  if (!res.ok) throw new Error(`CoinEx: ${res.status}`);
  const data = await res.json() as { code: number; message?: string; data: { ccy: string; available: string; frozen: string }[] };
  if (data.code !== 0) throw new Error(`CoinEx code ${data.code}: ${data.message ?? ""}`);
  return (data.data ?? [])
    .map((b) => ({ asset: b.ccy, free: parseFloat(b.available), locked: parseFloat(b.frozen), total: parseFloat(b.available) + parseFloat(b.frozen) }))
    .filter((b) => b.total > 0);
}

// ── Route ──────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const body = await request.json() as { exchange: string; apiKey: string; apiSecret: string };
  const { exchange, apiKey, apiSecret } = body;

  if (!exchange || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  try {
    let balances: CexBalance[] = [];
    if (exchange === "binance") balances = await fetchBinance(apiKey, apiSecret);
    else if (exchange === "kraken") balances = await fetchKraken(apiKey, apiSecret);
    else if (exchange === "coinex") balances = await fetchCoinEx(apiKey, apiSecret);
    else return NextResponse.json({ error: "Unknown exchange" }, { status: 400 });

    return NextResponse.json({ exchange, balances } satisfies CexBalanceResponse);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ exchange, balances: [], error: msg } satisfies CexBalanceResponse, { status: 502 });
  }
}
