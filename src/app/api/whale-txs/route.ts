import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ETHERSCAN_API = "https://api.etherscan.io/api";
const API_KEY = process.env.ETHERSCAN_API_KEY ?? ""; // optional — public tier works without key

type EtherscanTx = {
  hash: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol?: string;
  tokenDecimal?: string;
  timeStamp: string;
  tokenName?: string;
  contractAddress?: string;
  gasUsed?: string;
};

async function getEthTxs(address: string): Promise<EtherscanTx[]> {
  const params = new URLSearchParams({
    module: "account",
    action: "tokentx",
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "20",
    sort: "desc",
    ...(API_KEY ? { apikey: API_KEY } : {}),
  });

  const res = await fetch(`${ETHERSCAN_API}?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Owlfund/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`etherscan ${res.status}`);
  const data = (await res.json()) as { status: string; result: EtherscanTx[] | string };
  if (data.status !== "1" || !Array.isArray(data.result)) return [];
  return data.result;
}

async function getEthNativeTxs(address: string): Promise<EtherscanTx[]> {
  const params = new URLSearchParams({
    module: "account",
    action: "txlist",
    address,
    startblock: "0",
    endblock: "99999999",
    page: "1",
    offset: "10",
    sort: "desc",
    ...(API_KEY ? { apikey: API_KEY } : {}),
  });

  const res = await fetch(`${ETHERSCAN_API}?${params}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Owlfund/1.0)" },
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { status: string; result: EtherscanTx[] | string };
  if (data.status !== "1" || !Array.isArray(data.result)) return [];
  return data.result.map((tx) => ({ ...tx, tokenSymbol: "ETH", tokenDecimal: "18", tokenName: "Ethereum" }));
}

function toUsd(value: string, decimals: string, priceUsd: number): number {
  const dec = parseInt(decimals || "18");
  const amount = Number(value) / Math.pow(10, dec);
  return amount * priceUsd;
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address");
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }

  try {
    // Fetch token txs and native ETH txs in parallel
    const [tokenTxs, nativeTxs] = await Promise.allSettled([
      getEthTxs(address),
      getEthNativeTxs(address),
    ]);

    const tokens = tokenTxs.status === "fulfilled" ? tokenTxs.value : [];
    const native = nativeTxs.status === "fulfilled" ? nativeTxs.value : [];

    // Rough ETH price for USD estimate (static — avoids extra API call)
    const ETH_PRICE_USD = 3200;
    const TOKEN_PRICES: Record<string, number> = {
      ETH: ETH_PRICE_USD,
      USDT: 1,
      USDC: 1,
      WETH: ETH_PRICE_USD,
      WBTC: 97000,
      LINK: 14,
      UNI: 7,
      AAVE: 180,
      MKR: 1600,
    };

    const all = [...tokens.slice(0, 15), ...native.slice(0, 5)];

    const txs = all
      .map((tx) => {
        const symbol = tx.tokenSymbol ?? "ETH";
        const price = TOKEN_PRICES[symbol] ?? 0;
        const usdValue = toUsd(tx.value, tx.tokenDecimal ?? "18", price);
        const direction = tx.from.toLowerCase() === address.toLowerCase() ? "out" : "in";
        return {
          hash: tx.hash,
          direction,
          symbol,
          tokenName: tx.tokenName ?? symbol,
          usdValue,
          amount: (Number(tx.value) / Math.pow(10, parseInt(tx.tokenDecimal ?? "18"))).toFixed(4),
          timestamp: parseInt(tx.timeStamp) * 1000,
          from: tx.from,
          to: tx.to,
          isBigMove: usdValue >= 100_000,
        };
      })
      .filter((tx) => tx.usdValue > 0)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);

    return NextResponse.json({ txs }, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "fetch failed" },
      { status: 502 }
    );
  }
}
