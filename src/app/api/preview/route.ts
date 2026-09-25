import { NextResponse } from "next/server";
import { rateLimitPublic } from "@/lib/api/requireUser";
import { alchemyNftsForOwner, alchemyTokensByWallet, hasAlchemy, type EvmChainKey } from "@/lib/providers/alchemy";
import { hasHelius, heliusAssetsByOwner } from "@/lib/providers/helius";
import { isValidBtcAddress } from "@/lib/wallets/btcAddress";
import { getUsdPrices } from "@/lib/api/whales";

// "Experimenta sem conta" (landing): quem ainda nao tem conta cola um endereco
// publico e ve o que la esta, antes de decidir registar-se.
//
// Custos e abuso: cada consulta gasta quota da Alchemy/Helius, por isso
// (1) limite de 8 consultas por 10 min por IP e (2) 5 min de cache na CDN por
// endereco — o mesmo endereco pedido por varias pessoas so chega aqui uma vez.
// Privacidade: o endereco NAO e guardado nem escrito nos registos (so a
// mensagem de erro, sem o endereco).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

const EVM: EvmChainKey[] = ["eth", "base", "arbitrum", "optimism", "polygon"];
const MIN_USD = 1; // abaixo disto, tokens sem valor (quase sempre spam de airdrop) ficam de fora
const TOP = 8;

type Linha = { symbol: string; name: string; chain: string; balance: number; usdValue: number; logo?: string };
type Resposta = {
  kind: "evm" | "sol" | "btc";
  networks: string[];
  totalUsd: number;
  tokens: Linha[];
  others: number;
  nftCount: number | null;
};

const CACHE = "public, s-maxage=300, stale-while-revalidate=600";
const responder = (body: Resposta | { error: string }, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": status === 200 ? CACHE : "no-store" } });

function resumir(kind: Resposta["kind"], networks: string[], linhas: Linha[], nftCount: number | null): Resposta {
  const nativo = new Set(["ETH", "POL", "MATIC", "SOL", "BTC"]);
  const validas = linhas
    .filter((l) => l.balance > 0 && (l.usdValue >= MIN_USD || (nativo.has(l.symbol) && l.usdValue > 0)))
    .sort((a, b) => b.usdValue - a.usdValue);
  return {
    kind,
    networks,
    totalUsd: validas.reduce((s, l) => s + l.usdValue, 0),
    tokens: validas.slice(0, TOP),
    others: Math.max(0, validas.length - TOP),
    nftCount,
  };
}

export async function GET(req: Request) {
  const limitado = rateLimitPublic(req, "preview", 8, 10 * 60_000);
  if (limitado) return limitado;

  const address = (new URL(req.url).searchParams.get("address") ?? "").trim();

  try {
    // Ethereum e redes compativeis (o mesmo endereco serve em todas)
    if (/^0x[a-fA-F0-9]{40}$/.test(address)) {
      if (!hasAlchemy()) return responder({ error: "unavailable" }, 503);
      const [tokens, nfts] = await Promise.all([
        alchemyTokensByWallet(address, EVM),
        alchemyNftsForOwner(address, "eth", 1).catch(() => null),
      ]);
      const linhas = tokens.map((t) => ({ symbol: t.symbol, name: t.name, chain: t.chain, balance: t.balance, usdValue: t.usdValue, logo: t.logo }));
      return responder(resumir("evm", EVM, linhas, nfts ? nfts.total : null));
    }

    // Bitcoin
    if (isValidBtcAddress(address)) {
      const [res, precos] = await Promise.all([
        fetch(`https://mempool.space/api/address/${encodeURIComponent(address)}`, { signal: AbortSignal.timeout(10_000), next: { revalidate: 120 } }),
        getUsdPrices(),
      ]);
      if (!res.ok) return responder({ error: "unavailable" }, 503);
      const d = (await res.json()) as { chain_stats?: { funded_txo_sum?: number; spent_txo_sum?: number }; mempool_stats?: { funded_txo_sum?: number; spent_txo_sum?: number } };
      const sats = (d.chain_stats?.funded_txo_sum ?? 0) - (d.chain_stats?.spent_txo_sum ?? 0)
        + (d.mempool_stats?.funded_txo_sum ?? 0) - (d.mempool_stats?.spent_txo_sum ?? 0);
      const btc = Math.max(0, sats) / 1e8;
      const usd = btc * (precos.btc ?? 0);
      return responder(resumir("btc", ["btc"], [{ symbol: "BTC", name: "Bitcoin", chain: "btc", balance: btc, usdValue: usd }], null));
    }

    // Solana
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) {
      if (!hasHelius()) return responder({ error: "unavailable" }, 503);
      const a = await heliusAssetsByOwner(address);
      const linhas: Linha[] = a.fungibles.map((f) => ({ symbol: f.symbol, name: f.name, chain: "sol", balance: f.balance, usdValue: f.usdValue, logo: f.logo }));
      if (a.native && a.native.sol > 0) linhas.push({ symbol: "SOL", name: "Solana", chain: "sol", balance: a.native.sol, usdValue: a.native.usdValue });
      return responder(resumir("sol", ["sol"], linhas, a.nfts.length));
    }

    return responder({ error: "invalid" }, 400);
  } catch (e) {
    console.error("[preview]", e instanceof Error ? e.message : "erro");
    return responder({ error: "unavailable" }, 503);
  }
}
