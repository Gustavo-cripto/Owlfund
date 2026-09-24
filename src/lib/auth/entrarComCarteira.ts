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

// A frase que aparece na carteira. Tem de ser ASCII puro: a norma Sign-In
// with Solana (e a with Ethereum) so aceita caracteres URI e espacos no
// `statement`, e a Phantom recusa a mensagem inteira ("cannot be shown due
// to invalid formatting") se aparecer um acento. Por isso "so" e "nao" nao
// entram aqui — e ha uma rede por baixo que tira diacriticos ao que sobrar.
const FRASES: Record<Lang, string> = {
  pt: "Entrar na ChainFolioAI. Apenas leitura: esta assinatura nunca move fundos.",
  en: "Sign in to ChainFolioAI. Read-only: this signature never moves funds.",
  es: "Entrar en ChainFolioAI. Solo lectura: esta firma nunca mueve fondos.",
  fr: "Connexion a ChainFolioAI. Lecture seule : cette signature ne bouge jamais vos fonds.",
};
const ascii = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
const frase = (lang: Lang) => ascii(FRASES[lang] ?? FRASES.pt);

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
  if (!provider) throw new Error("MetaMask não está disponível.");
  const contas = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const address = contas?.[0];
  if (!address) throw new Error("A carteira não devolveu nenhum endereço.");
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithWeb3({ chain: "ethereum", wallet: provider as never, statement: frase(lang) });
  if (error) throw new Error(error.message);
  guardarCarteiraLigada("eth", address, "Ethereum");
  return { address };
}

export async function entrarComSolana(lang: Lang = "pt"): Promise<{ address: string }> {
  const wallet = typeof window !== "undefined" ? (window.solana as unknown as { publicKey?: { toBase58?: () => string }; connect?: (o?: unknown) => Promise<unknown> } | undefined) : undefined;
  if (!wallet) throw new Error("Phantom não está disponível.");
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signInWithWeb3({ chain: "solana", wallet: wallet as never, statement: frase(lang) });
  if (error) throw new Error(error.message);
  const address = wallet.publicKey?.toBase58?.();
  if (!address) throw new Error("A carteira não devolveu nenhum endereço.");
  guardarCarteiraLigada("sol", address, "Solana");
  return { address };
}
