// Orçamento de contexto do Block (Gestor IA).
//
// O Groq (único fornecedor configurado) recusa pedidos acima de 8 000 tokens
// por minuto no modelo gpt-oss-120b — e conta a entrada MAIS os tokens de saída
// pedidos. Com o resumo completo da conta, o conhecimento da plataforma e o
// histórico da conversa, um pedido chegava a 8 875 tokens e o Block respondia
// "não foi possível gerar a análise".
//
// Em vez de cortar às cegas, escolhe-se o que entra pela PERGUNTA: as secções
// "=== TÍTULO ===" do resumo que têm a ver com o que o utilizador perguntou
// entram inteiras, as restantes entram resumidas ou ficam de fora, e tudo é
// medido contra um orçamento em caracteres. Sem base de dados, para ser
// testável (scripts/testes/orcamentoBlock.test.ts).

export type Seccao = { titulo: string; corpo: string };

/** Estimativa conservadora: texto em português com números e símbolos tokeniza mal. */
export const estimarTokens = (texto: string): number => Math.ceil(texto.length / 2.6);

/** Parte um texto com cabeçalhos "=== TÍTULO ===" nas suas secções. Texto antes do 1.º cabeçalho fica com título "". */
export function partirSeccoes(texto: string): Seccao[] {
  const out: Seccao[] = [];
  let atual: Seccao | null = null;
  for (const linha of texto.split("\n")) {
    const m = linha.match(/^=== (.+?) ===\s*$/);
    if (m) {
      if (atual) out.push(atual);
      atual = { titulo: m[1], corpo: "" };
      continue;
    }
    if (!atual) atual = { titulo: "", corpo: "" };
    atual.corpo += (atual.corpo ? "\n" : "") + linha;
  }
  if (atual) out.push(atual);
  return out.map((s) => ({ ...s, corpo: s.corpo.trim() })).filter((s) => s.corpo);
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const tem = (pergunta: string, palavras: string[]) => palavras.some((p) => pergunta.includes(p));

// Palavras-chave por tema (PT/EN/ES/FR), já sem acentos.
const TEMAS: Array<{ chave: string; palavras: string[] }> = [
  { chave: "carteiras", palavras: ["carteira", "wallet", "saldo", "balance", "token", "ledger", "trezor", "portefeuille", "cartera", "solde", "on-chain", "onchain", "metamask", "phantom"] },
  { chave: "exchanges", palavras: ["exchange", "corretora", "binance", "coinbase", "kraken", "okx", "bybit", "broker", "cex", "hyperliquid", "degiro", "trading 212", "courtier", "plateforme"] },
  { chave: "defi", palavras: ["defi", "pool", "liquidez", "liquidity", "liquidite", "uniswap", "aave", "staking", "emprestimo", "lending", "par ", "pair", "posic", "position", "posicion", "intervalo", "range", "yield", "farm"] },
  { chave: "nft", palavras: ["nft"] },
  { chave: "manual", palavras: ["manual", "registad", "registr", "recorded", "stablecoin", "usdt", "usdc", "tradicional", "traditional", "traditionnel", "acoes", "acciones", "actions", "etf", "stock", "ouro", "gold"] },
  { chave: "transacoes", palavras: ["transa", "trade", "compra", "venda", "buy", "sell", "sold", "bought", "fifo", "mais-valia", "mais valia", "plusval", "plus-value", "gain", "realiz", "custo", "cost", "pnl", "lucro", "prejuizo", "profit", "loss"] },
  { chave: "movimentos", palavras: ["moviment", "mudou", "mudan", "changed", "change", "alterac", "alterou", "recent", "ultimos dias", "ultima semana", "esta semana", "cambio", "change", "bouge", "entrou", "saiu", "historico de carteiras", "history"] },
  { chave: "fire", palavras: ["fire", "reforma", "retire", "retirement", "independenc", "despesa", "expense", "gasto", "4%", "4 %", "patrimonio", "jubil", "retraite"] },
  { chave: "fiscal", palavras: ["imposto", "fiscal", "irs", "tax", "impot", "impuesto", "declar", "mais-valia", "mais valia", "plusval", "plus-value", "isen", "exempt", "contabil", "accountant", "hacienda", "finanças", "financas"] },
  { chave: "baleias", palavras: ["baleia", "whale", "smart money", "watchlist", "ballena", "baleine", "vitalik", "binance cold", "seguir", "follow"] },
  { chave: "plataforma", palavras: ["onde", "where", "donde", "pagina", "page", "plano", "plan ", "preco", "price", "pricing", "api", "mcp", "webhook", "funcionalidade", "feature", "fonctionnalite", "ajuda", "help", "aide", "ayuda", "upgrade", "premium", "exportar", "export", "pdf", "csv", "ligar", "connect", "conectar", "adicionar", "configur", "chainfolio", "posso fazer", "can i do", "puedo hacer", "puis-je"] },
  { chave: "historico", palavras: ["subiu", "desceu", "variac", "variation", "variacion", "change", "up ", "down", "dias", "days", "jours", "ano", "year", "mes", "month", "desde", "since", "evolu", "performance", "desempenho", "rendimento", "return", "roi", "cagr", "sharpe", "drawdown", "queda", "volatil", "benchmark", "pontua", "score", "metric"] },
];

/** Temas presentes na pergunta. */
export function temasDaPergunta(pergunta: string): Set<string> {
  const p = ` ${norm(pergunta)} `;
  return new Set(TEMAS.filter((t) => tem(p, t.palavras)).map((t) => t.chave));
}

// Que tema cobre cada secção do resumo do cliente (pelo início do título).
const TEMA_DA_SECCAO: Array<[RegExp, string]> = [
  [/^CARTEIRAS ON-CHAIN/i, "carteiras"], [/^EXCHANGES/i, "exchanges"], [/^POSI[ÇC][ÕO]ES DEFI/i, "defi"], [/^NFT/i, "nft"],
  [/^CRIPTO REGISTADA/i, "manual"], [/^STABLECOINS/i, "manual"], [/^MERCADO TRADICIONAL/i, "manual"],
  [/^TRANSA/i, "transacoes"], [/^MOVIMENTOS/i, "movimentos"], [/^PLANO FIRE/i, "fire"],
  [/^HIST[ÓO]RICO DO PORTEF/i, "historico"], [/^PONTUA/i, "historico"], [/^FISCALIDADE/i, "fiscal"], [/^BALEIAS/i, "baleias"],
];
export const temaDaSeccao = (titulo: string): string | null => TEMA_DA_SECCAO.find(([re]) => re.test(titulo))?.[1] ?? null;

// Secções que entram sempre (resumidas) numa pergunta genérica como "analisa o meu portefólio".
const NUCLEO = new Set(["carteiras", "exchanges", "defi", "manual", "historico"]);
// Secções só a pedido explícito (longas ou raramente úteis sem a pergunta certa).
const SO_A_PEDIDO = new Set(["fiscal", "baleias", "nft", "movimentos", "fire", "transacoes"]);

const cortar = (s: string, max: number) => (s.length <= max ? s : s.slice(0, max).replace(/\n[^\n]*$/, "") + "\n[…]");

/**
 * Escolhe e corta as secções para caber no orçamento (em caracteres).
 * Prioridade: PORTEFÓLIO (totais) > secções do tema perguntado (inteiras, até
 * `maxTema`) > núcleo resumido (até `maxNucleo`) > resto resumido, se sobrar.
 */
export function selecionarSeccoes(
  seccoes: Seccao[],
  pergunta: string,
  orcamentoChars: number,
  limites = { maxTema: 3500, maxNucleo: 900, maxResto: 400 },
): string {
  const temas = temasDaPergunta(pergunta);
  const prioridade = (s: Seccao): number => {
    if (/^PORTEF[ÓO]LIO/i.test(s.titulo) || s.titulo === "") return 3;
    const tema = temaDaSeccao(s.titulo);
    if (tema && temas.has(tema)) return 2;
    if (tema && NUCLEO.has(tema)) return 1;
    if (tema && SO_A_PEDIDO.has(tema)) return 0;
    return 1;
  };
  const ordenadas = seccoes
    .map((s, i) => ({ s, p: prioridade(s), i }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || a.i - b.i);
  const partes: string[] = [];
  let usado = 0;
  for (const { s, p } of ordenadas) {
    const max = p >= 2 ? limites.maxTema : p === 1 ? limites.maxNucleo : limites.maxResto;
    const corpo = cortar(s.corpo, max);
    const bloco = s.titulo ? `=== ${s.titulo} ===\n${corpo}` : corpo;
    if (usado + bloco.length + 2 > orcamentoChars) {
      // Sem espaço para a secção inteira: se é do tema, entra o que couber (mín. 300 chars).
      const resto = orcamentoChars - usado - 2;
      if (p >= 2 && resto > 300) { partes.push(cortar(bloco, resto)); usado += resto + 2; }
      continue;
    }
    partes.push(bloco);
    usado += bloco.length + 2;
  }
  return partes.join("\n\n");
}

/**
 * Corta o histórico da conversa para caber: a última mensagem do utilizador
 * entra sempre; as anteriores, da mais recente para a mais antiga, até ao orçamento.
 */
export function cortarHistorico<T extends { role: string; content: string }>(
  mensagens: T[],
  orcamentoChars: number,
  maxPorMensagem = 1500,
): T[] {
  if (!mensagens.length) return [];
  const ultima = mensagens[mensagens.length - 1];
  const out: T[] = [{ ...ultima, content: ultima.content.slice(0, Math.max(maxPorMensagem, 3000)) }];
  let usado = out[0].content.length;
  for (let i = mensagens.length - 2; i >= 0; i--) {
    const m = mensagens[i];
    const content = m.content.length > maxPorMensagem ? m.content.slice(0, maxPorMensagem) + " […]" : m.content;
    if (usado + content.length > orcamentoChars) break;
    out.unshift({ ...m, content });
    usado += content.length;
  }
  return out;
}
