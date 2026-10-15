// Onde ver um NFT na blockchain, por rede (15 out 2026: o dono quis ver o
// contrato ao tocar num NFT; antes o toque levava sempre ao OpenSea da
// Ethereum, mesmo para NFTs da Base ou da Polygon).
//
// O "contrato" muda de nome conforme a rede:
//   EVM      → contrato (ERC-721/1155) + token ID
//   Solana   → endereço do token (mint)
//   Bitcoin  → inscrição (Ordinals), não há contrato
//   Cardano  → policy ID (os primeiros 56 caracteres do "unit")

export type TipoId = "contrato" | "mint" | "inscricao" | "policy";

export type LigacoesNft = {
  rede: string;
  tipo: TipoId;
  /** O identificador a mostrar e copiar (contrato, mint, inscrição ou policy). */
  id: string | null;
  tokenId: string | null;
  explorador: string | null;
  mercado: string | null;
};

const EVM: Record<string, { base: string; nft: boolean; opensea?: string }> = {
  Ethereum: { base: "https://etherscan.io", nft: true, opensea: "ethereum" },
  Arbitrum: { base: "https://arbiscan.io", nft: true, opensea: "arbitrum" },
  Optimism: { base: "https://optimistic.etherscan.io", nft: true, opensea: "optimism" },
  Base: { base: "https://basescan.org", nft: true, opensea: "base" },
  Polygon: { base: "https://polygonscan.com", nft: true, opensea: "matic" },
  BSC: { base: "https://bscscan.com", nft: true },
  Avalanche: { base: "https://snowtrace.io", nft: false, opensea: "avalanche" },
  Linea: { base: "https://lineascan.build", nft: true },
  zkSync: { base: "https://explorer.zksync.io", nft: false },
};

/** Rede a partir do que as listas conhecem: nome da rede ("Base") ou cadeia curta ("eth", "sol", "btc", "ada"). */
export function redeDoNft(redeOuCadeia?: string | null): string {
  const r = (redeOuCadeia ?? "").trim();
  const curta: Record<string, string> = { eth: "Ethereum", sol: "Solana", btc: "Bitcoin", ada: "Cardano" };
  return curta[r.toLowerCase()] ?? (r || "Ethereum");
}

export function ligacoesNft(nft: { tokenAddress?: string | null; tokenId?: string | null; id?: string | null }, redeOuCadeia?: string | null): LigacoesNft {
  const rede = redeDoNft(redeOuCadeia);
  const addr = (nft.tokenAddress ?? "").trim() || null;
  const tokenId = (nft.tokenId ?? "").toString().trim() || null;
  const e = encodeURIComponent;

  if (rede === "Solana") {
    return { rede, tipo: "mint", id: addr, tokenId: null,
      explorador: addr ? `https://solscan.io/token/${e(addr)}` : null,
      mercado: addr ? `https://magiceden.io/item-details/${e(addr)}` : null };
  }
  if (rede === "Bitcoin") {
    const insc = addr ?? (nft.id ?? null);
    return { rede, tipo: "inscricao", id: insc, tokenId: null,
      explorador: insc ? `https://ordinals.com/inscription/${e(insc)}` : null,
      mercado: insc ? `https://magiceden.us/ordinals/item-details/${e(insc)}` : null };
  }
  if (rede === "Cardano") {
    const policy = addr && /^[0-9a-f]{56}/i.test(addr) ? addr.slice(0, 56) : addr;
    return { rede, tipo: "policy", id: policy, tokenId: null,
      explorador: addr ? `https://cardanoscan.io/token/${e(addr)}` : null,
      mercado: null };
  }
  const cfg = EVM[rede] ?? EVM.Ethereum;
  const explorador = addr
    ? (cfg.nft && tokenId ? `${cfg.base}/nft/${e(addr)}/${e(tokenId)}` : `${cfg.base}/address/${e(addr)}`)
    : null;
  return { rede: EVM[rede] ? rede : "Ethereum", tipo: "contrato", id: addr, tokenId,
    explorador,
    mercado: addr && tokenId && cfg.opensea ? `https://opensea.io/assets/${cfg.opensea}/${e(addr)}/${e(tokenId)}` : null };
}
