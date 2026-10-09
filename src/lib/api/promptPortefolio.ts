// Prompt ÚNICO do assistente de IA da API pública (/api/v1/chat) e da
// ferramenta MCP ask_ai. Antes cada rota tinha o seu, e já divergiam: um
// apresentava-se como "analista pessoal de investimentos" (puxa para conselho)
// e o outro não tinha a regra "se te faltarem dados, di-lo" (auditoria
// api-08, out 2026).
//
// Puro (sem base de dados nem rede) para poder ser testado sozinho em
// scripts/testes/promptPortefolioApi.test.ts. Quem lê os dados é src/lib/api/ai.ts.

import { NO_ADVICE_RULE, UNTRUSTED_DATA_RULE, dados } from "@/lib/ai/disclaimer";

/** O que o prompt recebe (já lido da base de dados e do mercado). */
export type EntradaPrompt = {
  /** Resultado de getPortfolio: snapshot já em lista branca, endereços em pseudónimo. */
  portfolio: { updatedAt: string | null; accountId: string | null; portfolio: unknown | null } | null;
  /** Resultado de getPnl (ou null se falhou). */
  pnl: unknown | null;
  /** Texto de mercadoAgoraTexto (ou null se nenhuma fonte respondeu). */
  mercado: string | null;
  /** Nome do portefólio e quantos portefólios a conta tem (do registo do wallet_config). */
  conta?: { nome: string | null; total: number } | null;
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

// Endereços que podem aparecer em texto livre (etiquetas escritas pelo
// utilizador, por exemplo). Os campos `address` já saem em pseudónimo
// (wallet_…); isto é a segunda rede, para nada em claro chegar à IA.
const PADROES_ENDERECO: RegExp[] = [
  /0x[a-fA-F0-9]{40}/g,                          // EVM
  /\b(?:bc1|tb1)[a-zA-HJ-NP-Z0-9]{25,87}\b/gi,   // Bitcoin bech32
  /\b(?:addr1|stake1)[0-9a-z]{20,}\b/g,          // Cardano
  /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g,        // Bitcoin legado
  /\b[1-9A-HJ-NP-Za-km-z]{32,}\b/g,              // Solana, xpub e afins (base58 longo)
];

/** Troca qualquer endereço de carteira em claro por "[endereço omitido]". */
export function semEnderecos(texto: string): string {
  let out = String(texto ?? "");
  for (const re of PADROES_ENDERECO) out = out.replace(re, "[endereço omitido]");
  return out;
}

const SIMBOLO_DA_REDE: Record<string, string> = { eth: "ETH", sol: "SOL", btc: "BTC", ada: "ADA" };

/** Símbolos nativos das redes com carteiras no snapshot (para o "mercado agora"). */
export function simbolosDoPortefolio(snapshot: unknown): string[] {
  if (!isObj(snapshot)) return [];
  return Object.entries(SIMBOLO_DA_REDE)
    .filter(([rede]) => Array.isArray(snapshot[rede]) && (snapshot[rede] as unknown[]).length > 0)
    .map(([, sym]) => sym);
}

/** Nome do portefólio `accountId` e quantos há na conta, a partir do registo do blob. */
export function contaDoRegisto(registry: unknown, accountId: string | null): { nome: string | null; total: number } | null {
  if (!isObj(registry) || !Array.isArray(registry.accounts)) return null;
  const contas = registry.accounts.filter((a): a is Record<string, unknown> => isObj(a) && typeof a.id === "string");
  const esta = accountId ? contas.find((a) => a.id === accountId) : undefined;
  return { nome: typeof esta?.name === "string" ? esta.name : null, total: contas.length };
}

const REDES = ["eth", "sol", "btc", "ada", "other"] as const;

/**
 * Resumo honesto do snapshot para a IA: carteiras com saldo em unidades
 * nativas (sem preço) e os agregados com a moeda no nome do campo. NÃO há
 * valor por ativo — o prompt di-lo explicitamente (auditoria api-04).
 */
export function resumoDoSnapshot(snapshot: unknown): Record<string, unknown> | null {
  if (!isObj(snapshot)) return null;
  const carteiras: Record<string, unknown> = {};
  for (const rede of REDES) {
    const lista = snapshot[rede];
    if (Array.isArray(lista) && lista.length) carteiras[rede] = lista;
  }
  const num = (k: string) => (typeof snapshot[k] === "number" ? snapshot[k] : undefined);
  return {
    carteiras_saldo_em_unidades_nativas: carteiras,
    agregados_usd: { cex: num("cexUsd"), defi: num("defiUsd"), tokens: num("tokensUsd") },
    agregados_eur: { ativos_manuais: num("manualEur"), ativos_tradicionais: num("traditionalEur") },
  };
}

export const REGRA_SEM_INVENCAO = `REGRA OBRIGATÓRIA — não inventes números:
- Preços, cotações e variações de mercado só dos dados <dados_mercado_agora>. Se um ativo não estiver lá (ou essa secção faltar), diz que não tens o preço atual dele; nunca uses preços da tua memória.
- Valores do portefólio só de <dados_portefolio> e <dados_pnl>. O valor total em euros é o totalEur de <dados_pnl> (última fotografia gravada, não ao vivo).
- NÃO há valor em euros por ativo: os saldos das carteiras estão em unidades nativas e os agregados (CEX, DeFi e tokens em USD; ativos manuais e tradicionais em EUR) não estão repartidos por ativo. Não calcules pesos, percentagens nem concentração por ativo; se to pedirem, diz que estes dados não o permitem e que a página Portefólio da app mostra a repartição.
- Um período do PNL a null quer dizer que não há fotografia suficientemente antiga: di-lo. O PNL já exclui o capital que entrou ou saiu (fluxoEur).
- Se te faltarem dados para responder, di-lo com franqueza.`;

/** Prompt de sistema completo. Puro: o mesmo para a API e o MCP. */
export function montarPromptPortefolio(e: EntradaPrompt): string {
  const p = e.portfolio;
  const nome = e.conta?.nome;
  const total = e.conta?.total ?? 0;
  const qual = p?.accountId
    ? `Este é o portefólio ${nome ? `"${semEnderecos(nome).slice(0, 60)}"` : `com o id ${p.accountId}`}${total > 1 ? `, um dos ${total} portefólios da conta; os outros não estão incluídos nestes dados` : ""}.`
    : "Não se sabe qual dos portefólios da conta é este (fotografia antiga sem etiqueta).";

  const portefolio = p?.portfolio != null
    ? { fotografia: p.updatedAt, ...resumoDoSnapshot(p.portfolio) }
    : { fotografia: null, nota: "Ainda não há fotografia do portefólio gravada." };

  return [
    "És o assistente de IA do ChainFolioAI. Explicas, de forma concisa e no idioma da pergunta, o portefólio real do utilizador e o mercado com base nos dados abaixo. Nunca uses LaTeX.",
    qual,
    REGRA_SEM_INVENCAO,
    NO_ADVICE_RULE,
    UNTRUSTED_DATA_RULE,
    "",
    dados("portefolio", semEnderecos(JSON.stringify(portefolio)), 6000),
    e.pnl ? dados("pnl", semEnderecos(JSON.stringify(e.pnl)), 3000) : "Sem dados de PNL neste momento: não comentes a evolução do portefólio.",
    e.mercado ? dados("mercado_agora", e.mercado, 2500) : "Sem dados de mercado ao vivo neste momento: não indiques preços atuais.",
  ].join("\n");
}
