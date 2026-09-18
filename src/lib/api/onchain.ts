import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getLendingPositions, LENDING_CHAINS, type LendingChain, type LendingPosition } from "@/lib/defi/lending";
import { getEigenLayerPositions, getMorphoPositions } from "@/lib/defi/morphoEigen";
import { alchemyNftsForOwner, hasAlchemy } from "@/lib/providers/alchemy";
import { networkKey } from "@/lib/wallets/networkKey";

// DeFi e NFTs das carteiras do próprio utilizador, para a API e o MCP.
//
// Ao contrário do resto da API, isto fala com a blockchain: cada endereço são
// várias chamadas a contratos. Por isso há um limite de endereços e a resposta
// diz sempre quantos foram lidos e quantos ficaram de fora — melhor um número
// honesto e incompleto do que uma espera de um minuto ou um total a fingir.

const MAX_ENDERECOS = 5;
const WALLETS_KEY = "portfolio-wallets";

type Blob = { data?: Record<string, Record<string, string>> };
type Entry = { address?: string; network?: string; label?: string };

/** Endereços EVM do utilizador, tirados do que a app sincroniza para a nuvem. */
async function enderecosEvm(userId: string): Promise<Array<{ address: string; label: string; network: string }>> {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("wallet_config").select("data").eq("user_id", userId).maybeSingle();
  const blob = (data?.data ?? null) as Blob | null;
  if (!blob?.data) return [];

  const vistos = new Set<string>();
  const out: Array<{ address: string; label: string; network: string }> = [];
  for (const porConta of Object.values(blob.data)) {
    const raw = porConta?.[WALLETS_KEY];
    if (typeof raw !== "string") continue;
    let snap: { eth?: Entry[] } | null = null;
    try { snap = JSON.parse(raw) as { eth?: Entry[] }; } catch { continue; }
    for (const e of snap?.eth ?? []) {
      const addr = (e.address ?? "").trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) continue;
      const chave = addr.toLowerCase();
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      out.push({ address: addr, label: e.label ?? "", network: networkKey(e.network) });
    }
  }
  return out;
}

async function posicoesDe(address: string, chains: readonly LendingChain[]): Promise<LendingPosition[]> {
  const r = await Promise.allSettled([
    getLendingPositions(address, chains),
    getMorphoPositions(address, chains),
    chains.includes("eth") ? getEigenLayerPositions(address) : Promise.resolve([] as LendingPosition[]),
  ]);
  return r.flatMap((x) => (x.status === "fulfilled" ? x.value : []));
}

export async function getDefiPositions(userId: string) {
  const todos = await enderecosEvm(userId);
  const usados = todos.slice(0, MAX_ENDERECOS);

  const porEndereco = await Promise.all(usados.map(async (w) => {
    const positions = await posicoesDe(w.address, LENDING_CHAINS);
    return {
      // O endereço não sai na API (é o critério do resto dos endpoints); vai a etiqueta.
      label: w.label || "sem nome",
      positions: positions.map((p) => ({
        protocol: p.protocol, name: p.name, chain: p.chain,
        suppliedUsd: p.supplied, borrowedUsd: p.borrowed, netUsd: p.usd,
        healthFactor: p.healthFactor,
      })),
      netUsd: positions.reduce((s, p) => s + p.usd, 0),
    };
  }));

  const comPosicoes = porEndereco.filter((w) => w.positions.length > 0);
  return {
    currency: "USD" as const,
    totalNetUsd: comPosicoes.reduce((s, w) => s + w.netUsd, 0),
    totalSuppliedUsd: comPosicoes.reduce((s, w) => s + w.positions.reduce((a, p) => a + p.suppliedUsd, 0), 0),
    totalBorrowedUsd: comPosicoes.reduce((s, w) => s + w.positions.reduce((a, p) => a + p.borrowedUsd, 0), 0),
    wallets: comPosicoes,
    walletsRead: usados.length,
    walletsSkipped: Math.max(0, todos.length - usados.length),
    chains: LENDING_CHAINS,
    note: `Lido dos contratos (Aave V3, Spark, Compound V3, Morpho, EigenLayer) em ${LENDING_CHAINS.join(", ")}. Depositado, emprestado e líquido em separado: o líquido é o que conta para o património, para uma posição alavancada não inflar o total. Máximo ${MAX_ENDERECOS} carteiras por pedido.`,
  };
}

export async function getNfts(userId: string, chain?: string) {
  if (!hasAlchemy()) {
    return { error: "provider_unavailable", message: "Fornecedor de NFTs não configurado neste servidor." };
  }
  const rede = (chain ?? "eth").toLowerCase();
  const permitidas = ["eth", "polygon", "arbitrum", "base", "optimism"];
  if (!permitidas.includes(rede)) {
    return { error: "unsupported_chain", message: `Rede não suportada para NFTs: ${rede}. Use uma de: ${permitidas.join(", ")}.` };
  }

  const todos = await enderecosEvm(userId);
  const usados = todos.slice(0, MAX_ENDERECOS);

  const porEndereco = await Promise.all(usados.map(async (w) => {
    try {
      const { nfts, total } = await alchemyNftsForOwner(w.address, rede as "eth", 50);
      return {
        label: w.label || "sem nome",
        total,
        returned: nfts.length,
        nfts: nfts.map((n) => ({ name: n.name, collection: n.tokenAddress ?? null, tokenId: n.tokenId ?? null })),
      };
    } catch {
      return { label: w.label || "sem nome", total: 0, returned: 0, nfts: [], error: "leitura falhou" };
    }
  }));

  const comNfts = porEndereco.filter((w) => w.returned > 0 || w.error);
  return {
    chain: rede,
    totalNfts: comNfts.reduce((s, w) => s + w.total, 0),
    wallets: comNfts,
    walletsRead: usados.length,
    walletsSkipped: Math.max(0, todos.length - usados.length),
    note: `NFTs das carteiras EVM do utilizador na rede indicada, até 50 por carteira e ${MAX_ENDERECOS} carteiras por pedido. Os NFTs NÃO entram no total do portefólio (não têm preço fiável).`,
  };
}
