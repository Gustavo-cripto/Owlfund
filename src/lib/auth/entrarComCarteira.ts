// Entrar com a carteira (MetaMask / Phantom), e ficar logo com ela ligada.
//
// A pessoa assina uma mensagem com a carteira e entra — sem email, sem
// palavra-passe. É o Supabase que valida a assinatura (Sign-In with Ethereum /
// Solana). Como já sabemos que endereço assinou, guardamo-lo de imediato na
// lista de carteiras da conta: quem entra assim abre as Carteiras e o
// Portefólio já com a carteira lá, em vez de a ter de ligar outra vez.
//
// Uma conta criada assim NÃO tem email: não recebe o briefing nem alertas até
// juntar um email em Conta. Fica dito no ecrã.
import { getSupabase } from "@/lib/supabase/lazy";
import { getEvmProviderById } from "@/lib/wallets/evm";
import { loadWalletSnapshot, updateWalletSnapshot, type StoredWalletEntry } from "@/lib/wallets/storage";
import { pushWalletCloud } from "@/lib/portfolios/cloudSync";

import type { Lang } from "@/lib/i18n/translations";
import { fraseCarteira } from "@/lib/auth/fraseCarteira";

/**
 * Erro com `code` para o ecra traduzir (userError({ codes })), em vez de uma
 * frase fixa em portugues que aparecia tal e qual na interface inglesa.
 *  - no_provider: a extensao nao esta disponivel
 *  - no_address: a carteira nao devolveu nenhum endereco
 *  - supabase: o Supabase recusou a assinatura (mensagem em ingles)
 */
export class ErroCarteira extends Error {
  code: "no_provider" | "no_address" | "supabase";
  constructor(code: "no_provider" | "no_address" | "supabase", message = code) {
    super(message);
    this.code = code;
  }
}

function guardarCarteiraLigada(rede: "eth" | "sol", address: string, network: string): void {
  const snap = loadWalletSnapshot();
  const lista: StoredWalletEntry[] = [...(snap[rede] ?? [])];
  const jaTem = lista.some((w) => (w.address ?? "").toLowerCase() === address.toLowerCase() && (w.network ?? network) === network);
  if (!jaTem) lista.push({ address, network, balance: "0" });
  updateWalletSnapshot({ [rede]: lista });
  pushWalletCloud();
}

export async function entrarComEthereum(lang: Lang = "pt"): Promise<{ address: string }> {
  const provider = getEvmProviderById("metamask") ?? (typeof window !== "undefined" ? window.ethereum : undefined);
  if (!provider) throw new ErroCarteira("no_provider");
  const contas = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const address = contas?.[0];
  if (!address) throw new ErroCarteira("no_address");
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithWeb3({ chain: "ethereum", wallet: provider as never, statement: fraseCarteira(lang) });
  if (error) throw new ErroCarteira("supabase", error.message);
  guardarCarteiraLigada("eth", address, "Ethereum");
  return { address };
}

export async function entrarComSolana(lang: Lang = "pt"): Promise<{ address: string }> {
  const wallet = typeof window !== "undefined" ? (window.solana as unknown as { publicKey?: { toBase58?: () => string }; connect?: (o?: unknown) => Promise<unknown> } | undefined) : undefined;
  if (!wallet) throw new ErroCarteira("no_provider");
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithWeb3({ chain: "solana", wallet: wallet as never, statement: fraseCarteira(lang) });
  if (error) throw new ErroCarteira("supabase", error.message);
  const address = wallet.publicKey?.toBase58?.();
  if (!address) throw new ErroCarteira("no_address");
  guardarCarteiraLigada("sol", address, "Solana");
  return { address };
}
