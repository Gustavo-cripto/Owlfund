import type { Lang } from "@/lib/i18n/translations";

// A frase que aparece na carteira ao entrar. Tem de ser ASCII puro: a norma
// Sign-In with Solana (e a with Ethereum) so aceita caracteres URI e espacos no
// `statement`, e a Phantom recusa a mensagem inteira ("cannot be shown due to
// invalid formatting") se aparecer um acento. Por isso "so" e "nao" nao entram
// aqui — e ha uma rede por baixo que tira diacriticos ao que sobrar.
export const FRASES: Record<Lang, string> = {
  pt: "Entrar na ChainFolioAI. Apenas leitura: esta assinatura nunca move fundos.",
  en: "Sign in to ChainFolioAI. Read-only: this signature never moves funds.",
  es: "Entrar en ChainFolioAI. Solo lectura: esta firma nunca mueve fondos.",
  fr: "Connexion a ChainFolioAI. Lecture seule : cette signature ne bouge jamais vos fonds.",
};

/** Tira acentos e tudo o que nao seja ASCII imprimivel. */
export const ascii = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");

export const fraseCarteira = (lang: Lang) => ascii(FRASES[lang] ?? FRASES.pt);
