import { NextResponse } from "next/server";
import { requireUser } from "@/lib/api/requireUser";

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
  native_token?: boolean;
  security_score?: number | null;
};

// Símbolos de scam conhecidos (airdrops fantasma com preço inflado). Case-insensitive.
const SCAM_SYMBOLS = new Set(["AICC"]);

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
  // Proxy pago (Moralis): só com sessão e com limite por utilizador.
  const guard = await requireUser(request, { route: "token-balances", limit: 120 });
  if (!guard.ok) return guard.response;
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

    // /wallets/{address}/tokens inclui preços (usd_price, usd_value) e o token nativo.
    await Promise.allSettled(evmChains.map(async (c) => {
      try {
        const res = await fetch(
          `${MORALIS_EVM}/wallets/${address}/tokens?chain=${c}&exclude_spam=true&limit=100`,
          { headers: { Accept: "application/json", "X-API-Key": moralisKey }, next: { revalidate: 120 } }
        );
        if (!res.ok) return;
        const data = await res.json() as EvmToken[] | { result?: EvmToken[] };
        const list = Array.isArray(data) ? data : (data as { result?: EvmToken[] }).result ?? [];
        rawTokens.push(...list.filter(t => !t.possible_spam));
      } catch { /* skip */ }
    }));

    // IMPORTANTE: usar SÓ os preços do Moralis (por contrato, não por símbolo).
    // Um fallback por símbolo daria a um token de spam "BTC" o preço real do Bitcoin → portefólio inflado.
    const allTokens: TokenBalance[] = [];

    for (const token of rawTokens) {
      const sym = (token.symbol ?? "?").toUpperCase();
      const balAmount = parseBalance(token);
      if (balAmount === 0) continue;

      const isNative = token.native_token === true || !token.token_address;
      // ANTI-SPAM (camadas):
      // 1) denylist de scams conhecidos (ex: AICC);
      // 2) security_score baixo do Moralis (< 40 = provável scam);
      // 3) só verificados (ou o nativo) — falsos "BTC" em triliões não são verificados.
      if (!isNative) {
        if (SCAM_SYMBOLS.has(sym)) continue;
        if (typeof token.security_score === "number" && token.security_score < 40) continue;
        if (token.verified_contract !== true) continue;
      }

      const usdPrice = Number(token.usd_price ?? 0);
      const usdValue = Number(token.usd_value ?? 0);

      allTokens.push({
        address: isNative ? "native" : (token.token_address ?? ""),
        symbol: sym,
        name: token.name ?? sym,
        logo: token.logo ?? token.thumbnail,
        balance: balAmount.toFixed(6),
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

      // Só preços do Moralis (por mint, não por símbolo) — evita avaliar spam pelo nome.
      const tokens: TokenBalance[] = list
        .filter(t => !t.possible_spam)
        .map(t => {
          const sym = (t.symbol ?? "?").toUpperCase();
          const balAmount = Number(t.amount ?? 0);
          const usdPrice = Number(t.usd_price ?? 0);
          const usdValue = Number(t.usd_value ?? 0);
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
