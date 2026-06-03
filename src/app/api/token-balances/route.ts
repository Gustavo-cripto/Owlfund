import { NextResponse } from "next/server";

const MORALIS_EVM = "https://deep-index.moralis.io/api/v2.2";
const MORALIS_SOL = "https://solana-gateway.moralis.io/account/mainnet";

type ChainId = "eth" | "sol";

type EvmToken = {
  token_address?: string;
  symbol?: string;
  name?: string;
  logo?: string;
  thumbnail?: string;
  decimals?: string | number;
  balance?: string;
  balance_formatted?: string;
  usd_value?: string | number;
  usd_price?: number;
  possible_spam?: boolean;
  verified_contract?: boolean;
};

type SolToken = {
  mint?: string;
  symbol?: string;
  name?: string;
  logo?: string;
  amount?: string | number;
  usd_value?: string | number;
  usd_price?: number;
  possible_spam?: boolean;
};

export type TokenBalance = {
  address: string;
  symbol: string;
  name: string;
  logo?: string;
  balance: string;
  usdValue: number;
  usdPrice: number;
  chain: ChainId;
};

function isEvmAddress(a: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(a);
}
function isSolAddress(a: string) {
  return typeof a === "string" && a.length >= 32 && a.length <= 44;
}

// CoinGecko IDs para símbolos comuns — fallback de preços quando Moralis não devolve usd_price
const COINGECKO_SYMBOLS: Record<string, string> = {
  ETH: "ethereum", WETH: "weth", BTC: "bitcoin", WBTC: "wrapped-bitcoin",
  SOL: "solana", WSOL: "wrapped-solana", BNB: "binancecoin", MATIC: "matic-network",
  POL: "matic-network", USDT: "tether", USDC: "usd-coin", DAI: "dai",
  LINK: "chainlink", UNI: "uniswap", AAVE: "aave", MKR: "maker",
  SNX: "synthetix-network-token", CRV: "curve-dao-token", LDO: "lido-dao",
  ARB: "arbitrum", OP: "optimism", SHIB: "shiba-inu", PEPE: "pepe",
};

async function fetchCoinGeckoPrices(symbols: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(symbols.map(s => COINGECKO_SYMBOLS[s.toUpperCase()]).filter(Boolean))];
  if (ids.length === 0) return {};
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=usd`,
      { next: { revalidate: 300 } }
    );
    if (!res.ok) return {};
    const data = await res.json() as Record<string, { usd?: number }>;
    const prices: Record<string, number> = {};
    for (const [sym, id] of Object.entries(COINGECKO_SYMBOLS)) {
      if (data[id]?.usd) prices[sym] = data[id].usd!;
    }
    return prices;
  } catch { return {}; }
}

function parseBalance(token: EvmToken): number {
  if (token.balance_formatted) return parseFloat(token.balance_formatted) || 0;
  if (!token.balance) return 0;
  const decimals = Number(token.decimals ?? 18);
  return Number(token.balance) / Math.pow(10, decimals);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = (searchParams.get("address") ?? "").trim();
  const chain = (searchParams.get("chain") ?? "eth") as ChainId;

  if (!address) return NextResponse.json({ error: "Endereço obrigatório.", tokens: [] }, { status: 400 });

  const moralisKey = process.env.MORALIS_API_KEY;
  if (!moralisKey) return NextResponse.json({ error: "MORALIS_API_KEY não configurada.", tokens: [] }, { status: 503 });

  // ── EVM tokens ──
  if (chain === "eth" && isEvmAddress(address)) {
    const evmChains = ["eth", "polygon", "arbitrum", "base"] as const;
    const rawTokens: EvmToken[] = [];

    await Promise.allSettled(evmChains.map(async (c) => {
      try {
        const res = await fetch(
          `${MORALIS_EVM}/${address}/erc20?chain=${c}&exclude_spam=true&limit=50`,
          { headers: { Accept: "application/json", "X-API-Key": moralisKey }, next: { revalidate: 120 } }
        );
        if (!res.ok) return;
        const data = await res.json() as EvmToken[] | { result?: EvmToken[] };
        const list = Array.isArray(data) ? data : (data as { result?: EvmToken[] }).result ?? [];
        rawTokens.push(...list.filter(t => !t.possible_spam));
      } catch { /* skip */ }
    }));

    // Fetch native ETH
    let nativeToken: TokenBalance | null = null;
    try {
      const res = await fetch(
        `${MORALIS_EVM}/${address}/balance?chain=eth`,
        { headers: { Accept: "application/json", "X-API-Key": moralisKey }, next: { revalidate: 120 } }
      );
      if (res.ok) {
        const data = await res.json() as { balance?: string; usd_value?: number };
        const balEth = Number(data.balance ?? "0") / 1e18;
        if (balEth > 0.0001) {
          nativeToken = {
            address: "native", symbol: "ETH", name: "Ethereum",
            balance: balEth.toFixed(6),
            usdValue: Number(data.usd_value ?? 0),
            usdPrice: Number(data.usd_value ?? 0) / balEth || 0,
            chain: "eth",
          };
        }
      }
    } catch { /* skip */ }

    // Get CoinGecko prices as fallback
    const symbols = rawTokens.map(t => t.symbol ?? "");
    const cgPrices = await fetchCoinGeckoPrices(["ETH", ...symbols]);

    // Fill native ETH price from CoinGecko if missing
    if (nativeToken && nativeToken.usdPrice === 0 && cgPrices["ETH"]) {
      const bal = parseFloat(nativeToken.balance);
      nativeToken.usdPrice = cgPrices["ETH"];
      nativeToken.usdValue = bal * cgPrices["ETH"];
    }

    const allTokens: TokenBalance[] = [];
    if (nativeToken) allTokens.push(nativeToken);

    for (const token of rawTokens) {
      const sym = (token.symbol ?? "?").toUpperCase();
      const balAmount = parseBalance(token);
      if (balAmount === 0) continue;

      let usdPrice = Number(token.usd_price ?? 0);
      let usdValue = Number(token.usd_value ?? 0);

      // Fallback to CoinGecko price
      if (usdPrice === 0 && cgPrices[sym]) {
        usdPrice = cgPrices[sym];
        usdValue = balAmount * usdPrice;
      }

      // Include even without price — show balance
      allTokens.push({
        address: token.token_address ?? "",
        symbol: sym,
        name: token.name ?? sym,
        logo: token.logo ?? token.thumbnail,
        balance: balAmount.toFixed(4),
        usdValue,
        usdPrice,
        chain: "eth",
      });
    }

    // Sort: tokens with USD value first, then by value desc
    allTokens.sort((a, b) => {
      if (a.usdValue > 0 && b.usdValue === 0) return -1;
      if (a.usdValue === 0 && b.usdValue > 0) return 1;
      return b.usdValue - a.usdValue;
    });

    const totalUsd = allTokens.reduce((s, t) => s + t.usdValue, 0);
    return NextResponse.json({ tokens: allTokens.slice(0, 30), totalUsd });
  }

  // ── Solana tokens ──
  if (chain === "sol" && isSolAddress(address)) {
    try {
      const res = await fetch(
        `${MORALIS_SOL}/${address}/tokens`,
        { headers: { Accept: "application/json", "X-API-Key": moralisKey }, next: { revalidate: 120 } }
      );
      if (!res.ok) return NextResponse.json({ error: "Falha Moralis Solana.", tokens: [] }, { status: 503 });

      const data = await res.json() as SolToken[] | { result?: SolToken[] };
      const list: SolToken[] = Array.isArray(data) ? data : (data as { result?: SolToken[] }).result ?? [];

      const cgPrices = await fetchCoinGeckoPrices(["SOL", ...list.map(t => t.symbol ?? "")]);

      const tokens: TokenBalance[] = list
        .filter(t => !t.possible_spam)
        .map(t => {
          const sym = (t.symbol ?? "?").toUpperCase();
          const balAmount = Number(t.amount ?? 0);
          let usdPrice = Number(t.usd_price ?? 0);
          let usdValue = Number(t.usd_value ?? 0);
          if (usdPrice === 0 && cgPrices[sym]) { usdPrice = cgPrices[sym]; usdValue = balAmount * usdPrice; }
          return { address: t.mint ?? "", symbol: sym, name: t.symbol ?? sym, logo: t.logo, balance: String(balAmount), usdValue, usdPrice, chain: "sol" as const };
        })
        .filter(t => Number(t.balance) > 0)
        .sort((a, b) => b.usdValue - a.usdValue);

      const totalUsd = tokens.reduce((s, t) => s + t.usdValue, 0);
      return NextResponse.json({ tokens: tokens.slice(0, 30), totalUsd });
    } catch {
      return NextResponse.json({ error: "Falha ao consultar tokens Solana.", tokens: [] }, { status: 503 });
    }
  }

  return NextResponse.json({ tokens: [], totalUsd: 0 });
}
