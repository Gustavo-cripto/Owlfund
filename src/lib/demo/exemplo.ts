// Modo de exemplo: carteiras públicas carregadas na conta VAZIA de quem acabou
// de se registar, para a app nunca aparecer em branco. As entradas levam
// `source: "demo"`: não contam como "conta com carteira" nas estatísticas
// (funil.ts), não geram fotografias do portefólio, e saem todas de uma vez ao
// remover o exemplo ou ao juntar uma carteira a sério.

import { loadWalletSnapshot, updateWalletSnapshot, type StoredWalletEntry, type WalletSnapshot } from "@/lib/wallets/storage";
import { ALL_ACCOUNTS_ID, accKey, getActiveAccountId } from "@/lib/portfolios/accounts";

/** Endereços públicos muito conhecidos (os mesmos da demonstração da página inicial). */
export const EXEMPLOS = {
  eth: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", // vitalik.eth
  btc: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", // bloco génese
  sol: "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg", // endereço da documentação da Solana
} as const;
export type RedeDemo = keyof typeof EXEMPLOS;

export const ROTULO_EXEMPLO: Record<RedeDemo, string> = { eth: "Exemplo · vitalik.eth", btc: "Exemplo · bloco génese", sol: "Exemplo · Solana" };
const REDE: Record<RedeDemo, string> = { eth: "Ethereum", btc: "Bitcoin", sol: "Solana" };
const MARCA = "cfa-exemplo-v1";
export const EVENTO_EXEMPLO = "cf-exemplo-mudou";

const eDemo = (e: StoredWalletEntry) => e.source === "demo";
const temWindow = () => typeof window !== "undefined";

/** A conta ativa está em modo de exemplo? */
export function exemploAtivo(): boolean {
  if (!temWindow() || getActiveAccountId() === ALL_ACCOUNTS_ID) return false;
  try {
    const s = loadWalletSnapshot();
    return [s.eth, s.sol, s.btc, s.ada].some((l) => (l ?? []).some(eDemo));
  } catch { return false; }
}

/** A conta ativa tem alguma carteira on-chain (de exemplo ou real)? */
export function contaTemCarteiras(): boolean {
  if (!temWindow()) return false;
  const s = loadWalletSnapshot();
  return [s.eth, s.sol, s.btc, s.ada].some((l) => (l ?? []).length > 0);
}

/** Saldo nativo pela demonstração pública (/api/preview), sem conta. null se falhar. */
async function saldoNativo(rede: RedeDemo, address: string): Promise<string | null> {
  try {
    const r = await fetch(`/api/preview?address=${encodeURIComponent(address)}`);
    if (!r.ok) return null;
    const j = (await r.json()) as { tokens?: Array<{ symbol: string; chain: string; balance: number }> };
    const simbolo = rede === "eth" ? "ETH" : rede === "btc" ? "BTC" : "SOL";
    const linha = j.tokens?.find((t) => t.symbol === simbolo && (rede !== "eth" || t.chain === "eth"));
    return linha && Number.isFinite(linha.balance) ? String(linha.balance) : null;
  } catch { return null; }
}

/**
 * Carrega o exemplo na conta ativa (só se não tiver carteiras). Os saldos são
 * lidos já (pela demonstração pública) para o Painel e o Portefólio terem
 * valores sem passar por Carteiras; a página de Carteiras volta a lê-los.
 */
export async function ativarExemplo(): Promise<boolean> {
  if (!temWindow() || getActiveAccountId() === ALL_ACCOUNTS_ID || contaTemCarteiras()) return false;
  const redes: RedeDemo[] = ["eth", "btc", "sol"];
  const saldos = await Promise.all(redes.map((r) => saldoNativo(r, EXEMPLOS[r])));
  const entrada = (r: RedeDemo, i: number): StoredWalletEntry => ({
    address: EXEMPLOS[r], network: REDE[r], label: ROTULO_EXEMPLO[r], source: "demo",
    ...(saldos[i] != null ? { balance: saldos[i] as string } : {}),
  });
  const patch: WalletSnapshot = { eth: [entrada("eth", 0)], btc: [entrada("btc", 1)], sol: [entrada("sol", 2)] };
  updateWalletSnapshot(patch);
  try { localStorage.setItem(accKey(MARCA), String(Date.now())); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENTO_EXEMPLO));
  return true;
}

/** Retira todas as entradas de exemplo da conta ativa. */
export function removerExemplo(): void {
  if (!temWindow() || getActiveAccountId() === ALL_ACCOUNTS_ID) return;
  const s = loadWalletSnapshot();
  const limpa = (l?: StoredWalletEntry[]) => (l ?? []).filter((e) => !eDemo(e));
  updateWalletSnapshot({ eth: limpa(s.eth), sol: limpa(s.sol), btc: limpa(s.btc), ada: limpa(s.ada) });
  try { localStorage.removeItem(accKey(MARCA)); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENTO_EXEMPLO));
}
