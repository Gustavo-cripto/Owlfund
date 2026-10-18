// "Possível NFT de lixo" na janela de um NFT (18 out 2026). Muitos NFTs chegam
// às carteiras sem ninguém os pedir — publicidade ou isco para burlas ("visita
// este site para reclamar a recompensa"). Não se esconde nada: só se avisa.
//   "isco": o nome traz um convite/endereço (claim, reward, visit, .com, t.me…)
//   "sem_dados": sem imagem nem metadados públicos (como a "Carol" do dono)

export type SuspeitaNft = "isco" | "sem_dados" | null;

const ISCO = /\b(claim|reward|visit|airdrop|voucher|bonus|redeem|free\s+mint|giveaway|eligible)\b|https?:\/\/|www\.|t\.me\/|\.(com|io|xyz|org|net|app|site|top|vip|gift|link)\b|\$\s?\d/i;

export function suspeitaNft(nft: { name?: string | null; image?: string | null; tokenUri?: string | null }): SuspeitaNft {
  const nome = (nft.name ?? "").trim();
  if (ISCO.test(nome)) return "isco";
  if (!nft.image && !nft.tokenUri) return "sem_dados";
  return null;
}
