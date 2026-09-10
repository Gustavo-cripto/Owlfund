// Perfis OFICIAIS do ChainFolioAI — fonte única para o rodapé e para os dados
// estruturados (schema.org `sameAs`, que diz ao Google e aos modelos de IA que
// estes perfis são mesmo da marca).
//
// As contas pessoais do Gustavo (@Gust_ste, @gust_criptoai, gustcrypto.bsky.social)
// NÃO entram aqui de propósito: no rodapé de um produto passariam por canal
// oficial. Se um dia quiseres um "criado por", é um link à parte.

export const SOCIAL_LINKS = [
  { label: "Bluesky", href: "https://bsky.app/profile/chainfolioai.bsky.social" },
  { label: "X", href: "https://x.com/ChainFolioAi" },
  { label: "Threads", href: "https://www.threads.net/@chainfolioai" },
  { label: "Reddit", href: "https://www.reddit.com/user/ChainFolioAi" },
] as const;

/** Só os endereços, para o campo `sameAs` do schema.org. */
export const SOCIAL_URLS: string[] = SOCIAL_LINKS.map((s) => s.href);
