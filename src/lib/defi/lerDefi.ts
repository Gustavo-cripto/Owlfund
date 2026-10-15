// Releitura do DeFi das carteiras da conta, igual à da página Carteiras (mesma
// API, mesmas chaves endereço:rede), para o Portefólio não mostrar uma posição
// já desfeita até a pessoa voltar às Carteiras (pedido do dono, 15 out 2026).
//
// Regra de sempre: só se grava quando TODAS as leituras acabam sem erro — um
// total parcial (ou 0 por falha) apagava o valor bom no snapshot e na nuvem.

import { updateWalletSnapshot, type StoredWalletEntry, type WalletSnapshot } from "@/lib/wallets/storage";
import { defiKey, networkToMoralisChain, normalizeChain } from "@/lib/wallets/formatar";
import type { PosicaoDefi } from "@/lib/defi/posicoes";

export const EVENTO_DEFI_RELIDO = "cf-defi-relido";

type Pedido = { chave: string; url: string };

function pedidos(snap: WalletSnapshot): Pedido[] {
  const reais = (l?: StoredWalletEntry[]) => (l ?? []).filter((w) => w.address && w.source !== "demo");
  const lista: Pedido[] = [];
  const vistos = new Set<string>();
  const juntar = (address: string, rede: string, url: string) => {
    const norm = `${address.toLowerCase()}:${normalizeChain(rede)}`;
    if (vistos.has(norm)) return;
    vistos.add(norm);
    lista.push({ chave: defiKey(address, rede), url });
  };
  for (const w of reais(snap.eth)) {
    const rede = w.network ?? "Ethereum";
    const evm = networkToMoralisChain(rede);
    const a = encodeURIComponent(w.address as string);
    juntar(w.address as string, rede, evm === "eth" ? `/api/defi-balance?address=${a}&chain=eth` : `/api/defi-balance?address=${a}&chain=eth&evmChain=${evm}`);
  }
  for (const [lst, chain] of [[snap.sol, "sol"], [snap.btc, "btc"], [snap.ada, "ada"]] as const) {
    for (const w of reais(lst)) juntar(w.address as string, chain, `/api/defi-balance?address=${encodeURIComponent(w.address as string)}&chain=${chain}`);
  }
  return lista;
}

/**
 * Relê o DeFi de todas as carteiras a sério da conta ativa e grava o total
 * (defiUsd) e as posições (defiPosicoes) no snapshot. Devolve o total novo, ou
 * null se alguma leitura falhou (nesse caso não grava nada).
 */
export async function relerDefiDaConta(snap: WalletSnapshot): Promise<number | null> {
  const lista = pedidos(snap);
  const resultados = await Promise.all(lista.map(async (p) => {
    try {
      const r = await fetch(p.url, { cache: "no-store", signal: AbortSignal.timeout(25_000) });
      const d = (await r.json()) as { total?: number; error?: string; positions?: PosicaoDefi[] };
      if (!r.ok || (d?.error && typeof d.total !== "number")) return null;
      return { chave: p.chave, total: typeof d.total === "number" && Number.isFinite(d.total) ? d.total : 0, posicoes: Array.isArray(d.positions) ? d.positions : [] };
    } catch { return null; }
  }));
  if (resultados.some((x) => x === null)) return null;
  let total = 0;
  const posicoes: Record<string, PosicaoDefi[]> = {};
  for (const x of resultados) { if (!x) continue; total += x.total; posicoes[x.chave] = x.posicoes; }
  updateWalletSnapshot({ defiUsd: total, defiPosicoes: posicoes, defiPosicoesEm: Date.now() });
  try { window.dispatchEvent(new CustomEvent(EVENTO_DEFI_RELIDO)); } catch { /* sem window */ }
  return total;
}
