// Nomes dados pelo utilizador ou por terceiros (etiquetas, tokens, NFTs,
// exchanges) vão aos prompts como DADOS: sem quebras de linha nem caracteres de
// controlo, sem "==" (a marca de secção é "===") e curtos, para que um nome
// malicioso não se consiga fazer passar por instrução ou por secção nova.
// Partilhado pelo Block (resumoBlock.ts, no browser) e pelo Assistente IA do
// Portefólio (/api/portfolio-ai, no servidor).
export const limpo = (s: unknown, max = 60): string =>
  String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/={2,}/g, "=").replace(/\s+/g, " ").trim().slice(0, max);
