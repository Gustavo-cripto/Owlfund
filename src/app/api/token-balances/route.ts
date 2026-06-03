import { NextResponse } from "next/server";

const MORALIS_EVM = "https://deep-index.moralis.io/api/v2.2";
const MORALIS_SOL = "https://solana-gateway.moralis.io/account/mainnet";

type ChainId = "eth" | "sol";

type EvmToken = {
  token_address?: string;
  symbol?: string;
  name?: string;
  logo?: string;
  decimals?: string | number;
  balance?: string;
  usd_value?: string | number;
  usd_price?: number;
  percentage_relative_to_total_supply?: number;
  possible_spam?: boolean;
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = (searchParams.get("address") ?? "").trim();
  const chain = (searchParams.get("chain") ?? "eth") as ChainId;

  if (!address) {
    return NextResponse.json({ error: "Endereço obrigatório." }, { status: 400 });
  }

  const moralisKey = process.env.MORALIS_API_KEY;
  if (!moralisKey) {
    return NextResponse.json({ error: "MORALIS_API_KEY não configurada.", tokens: [] }, { status: 503 });
  }

  // EVM tokens (Ethereum, Polygon, etc.)
  if (chain === "eth" && isEvmAddress(address)) {
    const evmChains = ["eth", "polygon", "arbitrum", "base"] as const;
    const allTokens: TokenBalance[] = [];

    await Promise.allSettled(
      evmChains.map(async (c) => {
        try {
          const res = await fetch(
            `${MORALIS_EVM}/${address}/erc20?chain=${c}&exclude_spam=true&exclude_unverified_contracts=true`,
            {
              headers: { Accept: "application/json", "X-API-Key": moralisKey },
              next: { revalidate: 120 },
            }
          );
          if (!res.ok) return;
          const data = (await res.json()) as EvmToken[] | { result?: EvmToken[] };
          const list: EvmToken[] = Array.isArray(data) ? data : (data as { result?: EvmToken[] }).result ?? [];

          for (const token of list) {
            if (token.possible_spam) continue;
            const usdValue = Number(token.usd_value ?? 0);
            if (usdValue < 0.01) continue; // skip dust
            allTokens.push({
              address: token.token_address ?? "",
              symbol: token.symbol ?? "?",
              name: token.name ?? token.symbol ?? "Token",
              logo: token.logo,
              balance: token.balance ?? "0",
              usdValue,
              usdPrice: token.usd_price ?? 0,
              chain: "eth",
            });
          }
        } catch {
          // skip chain
        }
      })
    );

    // Also fetch native ETH balance with USD value
    try {
      const res = await fetch(
        `${MORALIS_EVM}/${address}/balance?chain=eth`,
        {
          headers: { Accept: "application/json", "X-API-Key": moralisKey },
          next: { revalidate: 120 },
        }
      );
      if (res.ok) {
        const data = (await res.json()) as { balance?: string; usd_value?: number };
        const usdValue = Number(data.usd_value ?? 0);
        if (usdValue >= 0.01) {
          const ethBalance = (Number(data.balance ?? "0") / 1e18).toFixed(6);
          allTokens.unshift({
            address: "native",
            symbol: "ETH",
            name: "Ethereum",
            balance: ethBalance,
            usdValue,
            usdPrice: usdValue / Number(ethBalance || 1),
            chain: "eth",
          });
        }
      }
    } catch {
      // skip native
    }

    // Sort by USD value descending
    allTokens.sort((a, b) => b.usdValue - a.usdValue);

    const totalUsd = allTokens.reduce((s, t) => s + t.usdValue, 0);
    return NextResponse.json({ tokens: allTokens, totalUsd });
  }

  // Solana tokens
  if (chain === "sol" && isSolAddress(address)) {
    try {
      const res = await fetch(
        `${MORALIS_SOL}/${address}/tokens`,
        {
          headers: { Accept: "application/json", "X-API-Key": moralisKey },
          next: { revalidate: 120 },
        }
      );

      if (!res.ok) {
        return NextResponse.json({ error: "Falha Moralis Solana.", tokens: [] }, { status: 503 });
      }

      const data = (await res.json()) as SolToken[] | { result?: SolToken[] };
      const list: SolToken[] = Array.isArray(data) ? data : (data as { result?: SolToken[] }).result ?? [];

      const tokens: TokenBalance[] = list
        .filter((t) => !t.possible_spam)
        .map((t) => ({
          address: t.mint ?? "",
          symbol: t.symbol ?? "?",
          name: t.name ?? t.symbol ?? "Token",
          logo: t.logo,
          balance: String(t.amount ?? "0"),
          usdValue: Number(t.usd_value ?? 0),
          usdPrice: t.usd_price ?? 0,
          chain: "sol",
        }))
        .filter((t) => t.usdValue >= 0.01)
        .sort((a, b) => b.usdValue - a.usdValue);

      const totalUsd = tokens.reduce((s, t) => s + t.usdValue, 0);
      return NextResponse.json({ tokens, totalUsd });
    } catch {
      return NextResponse.json({ error: "Falha ao consultar tokens Solana.", tokens: [] }, { status: 503 });
    }
  }

  return NextResponse.json({ tokens: [], totalUsd: 0 });
}
