import { NextRequest, NextResponse } from "next/server";
import { getUsdPrices } from "@/lib/api/whales";
import { requireUser } from "@/lib/api/requireUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── Shared types ─────────────────────────────────────────────────────────────
type WhaleTx = {
  hash: string;
  direction: "in" | "out";
  symbol: string;
  tokenName: string;
  usdValue: number;
  amount: string;
  timestamp: number;
  from: string;
  to: string;
  isBigMove: boolean;
};

// ── ETH (Etherscan) ──────────────────────────────────────────────────────────
const ETHERSCAN_API = "https://api.etherscan.io/api";
const API_KEY = process.env.ETHERSCAN_API_KEY ?? "";

type EtherscanTx = {
  hash: string; from: string; to: string; value: string;
  tokenSymbol?: string; tokenDecimal?: string; timeStamp: string;
  tokenName?: string; contractAddress?: string;
};

async function getEthTxs(address: string): Promise<EtherscanTx[]> {
  const params = new URLSearchParams({
    module: "account", action: "tokentx", address,
    startblock: "0", endblock: "99999999", page: "1", offset: "100", sort: "desc",
    ...(API_KEY ? { apikey: API_KEY } : {}),
  });
  const res = await fetch(`${ETHERSCAN_API}?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ChainFolioAI/1.0)" }, cache: "no-store",
  });
  if (!res.ok) throw new Error(`etherscan ${res.status}`);
  const data = (await res.json()) as { status: string; result: EtherscanTx[] | string };
  if (data.status !== "1" || !Array.isArray(data.result)) return [];
  return data.result;
}

async function getEthNativeTxs(address: string): Promise<EtherscanTx[]> {
  const params = new URLSearchParams({
    module: "account", action: "txlist", address,
    startblock: "0", endblock: "99999999", page: "1", offset: "30", sort: "desc",
    ...(API_KEY ? { apikey: API_KEY } : {}),
  });
  const res = await fetch(`${ETHERSCAN_API}?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ChainFolioAI/1.0)" }, cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { status: string; result: EtherscanTx[] | string };
  if (data.status !== "1" || !Array.isArray(data.result)) return [];
  return data.result.map((tx) => ({ ...tx, tokenSymbol: "ETH", tokenDecimal: "18", tokenName: "Ethereum" }));
}

function toUsd(value: string, decimals: string, priceUsd: number): number {
  const dec = parseInt(decimals || "18");
  try {
    // BigInt: valores com 18 decimais ultrapassam 2^53 e perdiam precisão
    const whole = BigInt(value) / BigInt(10) ** BigInt(Math.max(0, dec - 6));
    return (Number(whole) / 1e6) * priceUsd;
  } catch {
    return (Number(value) / Math.pow(10, dec)) * priceUsd;
  }
}

async function getEthWhaleTxs(address: string): Promise<WhaleTx[]> {
  // Preços LIVE (CoinGecko, cache 60s) — antes estavam fixos no código
  // (ETH 3200, BTC 97000…) e todos os valores USD/alertas saíam errados.
  const live = await getUsdPrices();
  const ETH_PRICE_USD = live.eth ?? 0;
  const TOKEN_PRICES: Record<string, number> = {
    ETH: ETH_PRICE_USD, WETH: ETH_PRICE_USD, STETH: ETH_PRICE_USD, WSTETH: ETH_PRICE_USD * 1.15,
    USDT: 1, USDC: 1, DAI: 1, BUSD: 1, FDUSD: 1, PYUSD: 1, TUSD: 1,
    WBTC: live.btc ?? 0, CBBTC: live.btc ?? 0,
  };
  const [tokenTxs, nativeTxs] = await Promise.allSettled([
    getEthTxs(address), getEthNativeTxs(address),
  ]);
  const tokens = tokenTxs.status === "fulfilled" ? tokenTxs.value : [];
  const native = nativeTxs.status === "fulfilled" ? nativeTxs.value : [];
  const all = [...tokens.slice(0, 80), ...native.slice(0, 20)];
  return all
    .map((tx) => {
      const symbol = tx.tokenSymbol ?? "ETH";
      const price = TOKEN_PRICES[symbol] ?? 0;
      const usdValue = toUsd(tx.value, tx.tokenDecimal ?? "18", price);
      const amount = (Number(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal ?? "18"))).toFixed(4);
      return {
        hash: tx.hash,
        direction: tx.from.toLowerCase() === address.toLowerCase() ? "out" : "in",
        symbol, tokenName: tx.tokenName ?? symbol, usdValue, amount,
        timestamp: parseInt(tx.timeStamp) * 1000,
        from: tx.from, to: tx.to,
        isBigMove: usdValue >= 100_000,
      } as WhaleTx;
    })
    .filter((tx) => tx.usdValue > 0)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 100);
}

// ── BTC (Mempool.space) ───────────────────────────────────────────────────────
type MempoolTx = {
  txid: string;
  status: { confirmed: boolean; block_time?: number };
  vin: Array<{ prevout?: { scriptpubkey_address?: string; value?: number } }>;
  vout: Array<{ scriptpubkey_address?: string; value?: number }>;
};

async function getBtcWhaleTxs(address: string): Promise<WhaleTx[]> {
  const BTC_PRICE_USD = (await getUsdPrices()).btc ?? 0;

  const res = await fetch(
    `https://mempool.space/api/address/${encodeURIComponent(address)}/txs`,
    { headers: { "User-Agent": "Mozilla/5.0 (compatible; ChainFolioAI/1.0)" }, cache: "no-store" }
  );
  if (!res.ok) {
    // fallback blockstream
    const res2 = await fetch(
      `https://blockstream.info/api/address/${encodeURIComponent(address)}/txs`,
      { headers: { "User-Agent": "Mozilla/5.0 (compatible; ChainFolioAI/1.0)" }, cache: "no-store" }
    );
    if (!res2.ok) throw new Error(`BTC API ${res2.status}`);
    const data = (await res2.json()) as MempoolTx[];
    return parseBtcTxs(data, address, BTC_PRICE_USD);
  }
  const data = (await res.json()) as MempoolTx[];
  return parseBtcTxs(data, address, BTC_PRICE_USD);
}

function parseBtcTxs(txs: MempoolTx[], address: string, btcPriceUsd: number): WhaleTx[] {
  return txs
    .slice(0, 100)
    .map((tx) => {
      // Sum inputs from this address (sent)
      const sentSats = tx.vin
        .filter((v) => v.prevout?.scriptpubkey_address === address)
        .reduce((s, v) => s + (v.prevout?.value ?? 0), 0);

      // Sum outputs to this address (received)
      const receivedSats = tx.vout
        .filter((v) => v.scriptpubkey_address === address)
        .reduce((s, v) => s + (v.value ?? 0), 0);

      const netSats = receivedSats - sentSats;
      const direction: "in" | "out" = netSats >= 0 ? "in" : "out";
      const absSats = Math.abs(netSats);
      const btcAmount = absSats / 1e8;
      const usdValue = btcAmount * btcPriceUsd;

      // Counterparty address
      const counterparty = direction === "in"
        ? (tx.vin[0]?.prevout?.scriptpubkey_address ?? "?")
        : (tx.vout.find((v) => v.scriptpubkey_address !== address)?.scriptpubkey_address ?? "?");

      return {
        hash: tx.txid,
        direction,
        symbol: "BTC",
        tokenName: "Bitcoin",
        usdValue,
        amount: btcAmount.toFixed(6),
        timestamp: tx.status.block_time ? tx.status.block_time * 1000 : Date.now(),
        from: direction === "out" ? address : counterparty,
        to: direction === "in" ? address : counterparty,
        isBigMove: usdValue >= 100_000,
      } as WhaleTx;
    })
    .filter((tx) => tx.usdValue > 0)
    .sort((a, b) => b.timestamp - a.timestamp);
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Proxy pago (Etherscan/mempool): só com sessão e com limite por utilizador.
  const guard = await requireUser(req, { route: "whale-txs", limit: 60 });
  if (!guard.ok) return guard.response;
  const address = req.nextUrl.searchParams.get("address");
  const chain = req.nextUrl.searchParams.get("chain") ?? "eth";

  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

  try {
    let txs: WhaleTx[];
    if (chain === "btc") {
      // BTC address validation (P2PKH, P2SH, bech32)
      if (!/^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/.test(address)) {
        return NextResponse.json({ error: "invalid BTC address" }, { status: 400 });
      }
      txs = await getBtcWhaleTxs(address);
    } else {
      // ETH address validation
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return NextResponse.json({ error: "invalid ETH address" }, { status: 400 });
      }
      txs = await getEthWhaleTxs(address);
    }

    return NextResponse.json({ txs }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 }
    );
  }
}
