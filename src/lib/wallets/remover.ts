// "Que chaves apagar de cada mapa" quando se remove uma carteira na pagina de
// carteiras. Extraido de src/app/(pt)/wallets/page.tsx sem alteracoes de
// comportamento (fase 2): os setState continuam na pagina, aqui so se decide o
// que remover. Testes em scripts/testes/removerCarteiras.test.ts.
import type { StoredWalletEntry } from "@/lib/wallets/storage";
import { ethBalanceKey, removeWallet } from "@/lib/wallets/formatar";

/** Copia do mapa sem a chave. Devolve sempre um objeto novo (mesmo que a chave
 *  nao exista), como o `{ ...prev }` + `delete` que estava na pagina. */
export const semChave = <T>(mapa: Record<string, T>, chave: string): Record<string, T> => {
  const next = { ...mapa };
  delete next[chave];
  return next;
};

/** O que muda ao remover uma carteira de uma rede. */
export type Remocao = {
  /** Lista da rede sem a carteira. */
  nextWallets: StoredWalletEntry[];
  /** A carteira removida era a ligada pela extensao (limpar endereco/saldo/erro). */
  eraLigada: boolean;
  /** Chave a apagar dos mapas de saldo/erros (e Runes, no BTC). */
  chave: string;
};

/** Ethereum/EVM: a mesma morada pode estar em varias redes; a chave dos saldos
 *  e "<endereco>-<rede>" e so a da mainnet conta como a ligada. */
export const remocaoEth = (ethWallets: StoredWalletEntry[], item: StoredWalletEntry, ethAddress: string | undefined): Remocao => ({
  nextWallets: removeWallet(
    ethWallets,
    (entry) => entry.address === item.address && entry.network === item.network
  ),
  eraLigada: item.address === ethAddress && item.network === "Ethereum",
  chave: ethBalanceKey(item.address ?? "", item.network ?? ""),
});

/** Solana: rede em falta conta como "Solana"; a chave dos saldos e o endereco. */
export const remocaoSol = (solWallets: StoredWalletEntry[], item: StoredWalletEntry, solAddress: string | undefined): Remocao => ({
  nextWallets: removeWallet(solWallets, (entry) => entry.address === item.address && (entry.network ?? "Solana") === (item.network ?? "Solana")),
  eraLigada: item.address === solAddress,
  chave: item.address ?? "",
});

/** Bitcoin e Cardano: remove pelo endereco (todas as redes); a chave e o endereco. */
export const remocaoPorEndereco = (wallets: StoredWalletEntry[], item: StoredWalletEntry, ligado: string | undefined): Remocao => ({
  nextWallets: removeWallet(
    wallets,
    (entry) => entry.address === item.address
  ),
  eraLigada: item.address === ligado,
  chave: item.address ?? "",
});
