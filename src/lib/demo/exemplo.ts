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

// O dono pediu "Carteira Block" em vez do nome de uma pessoa (14 out 2026).
export const ROTULO_EXEMPLO: Record<RedeDemo, string> = { eth: "Exemplo · Carteira Block", btc: "Exemplo · bloco génese", sol: "Exemplo · Solana" };
const REDE: Record<RedeDemo, string> = { eth: "Ethereum", btc: "Bitcoin", sol: "Solana" };
const MARCA = "cfa-exemplo-v1";
// Quem já tirou o exemplo não o volta a ver carregado sozinho.
const RECUSADO = "cfa-exemplo-recusado-v1";
const JANELA_CONTA_NOVA_MS = 14 * 86_400_000;
export const EVENTO_EXEMPLO = "cf-exemplo-mudou";

const eDemo = (e: StoredWalletEntry) => e.source === "demo";
const temWindow = () => typeof window !== "undefined";

const ENDERECOS_EXEMPLO = new Set(Object.values(EXEMPLOS).map((a) => a.toLowerCase()));
/** O endereço é um dos do exemplo? (as leituras DeFi/NFT dele não contam para os totais) */
export function eEnderecoDeExemplo(address: string): boolean {
  return ENDERECOS_EXEMPLO.has(address.trim().toLowerCase());
}

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

/**
 * Exemplo carregado SOZINHO numa conta acabada de criar (14 out 2026: a única
 * conta real da história do site ficou 2 minutos num painel vazio e saiu; o
 * botão "ver com dados de exemplo" nunca foi tocado). Só quando:
 * a conta tem menos de 14 dias, nunca teve o exemplo nem o tirou, e não tem
 * carteiras (isto é verificado em ativarExemplo). Quem chama tem de garantir que
 * a nuvem foi lida com sucesso e que a conta não tem ativos manuais.
 */
export async function ativarExemploAutomatico(contaCriadaEm?: string | null): Promise<boolean> {
  if (!temWindow() || getActiveAccountId() === ALL_ACCOUNTS_ID) return false;
  try {
    if (localStorage.getItem(accKey(RECUSADO)) || localStorage.getItem(accKey(MARCA))) return false;
  } catch { return false; }
  const criada = contaCriadaEm ? Date.parse(contaCriadaEm) : NaN;
  if (!Number.isFinite(criada) || Date.now() - criada > JANELA_CONTA_NOVA_MS) return false;
  return ativarExemplo();
}

/** Retira todas as entradas de exemplo da conta ativa. */
export function removerExemplo(): void {
  if (!temWindow() || getActiveAccountId() === ALL_ACCOUNTS_ID) return;
  const s = loadWalletSnapshot();
  const limpa = (l?: StoredWalletEntry[]) => (l ?? []).filter((e) => !eDemo(e));
  // O DeFi lido nos endereços do exemplo também sai (14 out 2026: ficavam 105 $
  // de DeFi da carteira Solana de exemplo no total de uma conta nova, e a
  // fotografia do portefólio guardava-os). Sem carteiras a sério, o total é 0.
  const posicoes = Object.fromEntries(Object.entries(s.defiPosicoes ?? {}).filter(([k]) => !eEnderecoDeExemplo(k.slice(0, k.indexOf(":")))));
  const ficam = [limpa(s.eth), limpa(s.sol), limpa(s.btc), limpa(s.ada)];
  const semCarteiras = ficam.every((l) => l.length === 0);
  updateWalletSnapshot({ eth: ficam[0], sol: ficam[1], btc: ficam[2], ada: ficam[3], defiPosicoes: posicoes, defiPosicoesEm: Date.now(), ...(semCarteiras ? { defiUsd: 0 } : {}) });
  try { localStorage.removeItem(accKey(MARCA)); localStorage.setItem(accKey(RECUSADO), String(Date.now())); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENTO_EXEMPLO));
}
