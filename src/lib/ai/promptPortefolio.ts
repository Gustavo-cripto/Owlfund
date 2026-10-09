// Prompt e validação do Assistente IA do Portefólio (Pro e Premium). Puro, sem
// base de dados, para os testes (scripts/testes/promptPortefolio.test.ts) e para
// a rota /api/portfolio-ai.
//
// O contexto vem do browser: é tratado como dados de terceiros. Cada número é
// verificado, cada texto é limpo e cortado, e as listas têm teto.

import { NO_ADVICE_RULE, UNTRUSTED_DATA_RULE, dados } from "@/lib/ai/disclaimer";
import { limpo } from "@/lib/ai/limpo";

export type Alocacao = { label: string; symbol: string; valueEur: number; percent: string };

export type PortfolioContext = {
  totalEur: number;
  pnlPosition: number;
  pnlToday: number;
  pnl30d: number;
  /** Variação dos últimos 7 dias (posições atuais × preços de há 7 dias). */
  pnl7d?: number;
  /** % de cada período, já calculada pela página (null = sem base). */
  pctToday?: number | null;
  pct7d?: number | null;
  pct30d?: number | null;
  pctPosition?: number | null;
  traditionalEur?: number;
  stablecoinEur?: number;
  /** Pontuação 0–100 tal como está no ecrã. */
  score?: number | null;
  scoreParts?: Array<{ id: string; points: number; max: number }>;
  roi?: number;
  cagr?: number;
  sharpe?: number;
  maxDrawdown?: number;
  volatility?: number;
  days?: number;
  allocations: Alocacao[];
};

export const MAX_PERGUNTA = 1500;
const MAX_ALOCACOES = 40;
const MAX_PARTES = 10;
const LIMITE_EUR = 1e12;

const num = (v: unknown, max = LIMITE_EUR): number | undefined =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= max ? v : undefined;
const numOuNull = (v: unknown, max = LIMITE_EUR): number | null | undefined =>
  v === null ? null : num(v, max);

/** Contexto validado, ou null se faltar o essencial (total e alocações). */
export function contextoValido(raw: unknown): PortfolioContext | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const totalEur = num(c.totalEur);
  if (totalEur === undefined || totalEur < 0) return null;
  const allocations: Alocacao[] = (Array.isArray(c.allocations) ? c.allocations : [])
    .slice(0, MAX_ALOCACOES)
    .flatMap((a): Alocacao[] => {
      if (!a || typeof a !== "object") return [];
      const r = a as Record<string, unknown>;
      const valueEur = num(r.valueEur);
      if (valueEur === undefined) return [];
      return [{ label: limpo(String(r.label ?? ""), 60), symbol: limpo(String(r.symbol ?? ""), 16), valueEur, percent: limpo(String(r.percent ?? ""), 12) }];
    });
  const scoreParts = (Array.isArray(c.scoreParts) ? c.scoreParts : []).slice(0, MAX_PARTES).flatMap((p) => {
    if (!p || typeof p !== "object") return [];
    const r = p as Record<string, unknown>;
    const points = num(r.points, 1000), max = num(r.max, 1000);
    return points === undefined || max === undefined ? [] : [{ id: limpo(String(r.id ?? ""), 24), points, max }];
  });
  const score = numOuNull(c.score, 100);
  return {
    totalEur,
    pnlPosition: num(c.pnlPosition) ?? 0,
    pnlToday: num(c.pnlToday) ?? 0,
    pnl30d: num(c.pnl30d) ?? 0,
    pnl7d: num(c.pnl7d),
    pctToday: numOuNull(c.pctToday, 1e6),
    pct7d: numOuNull(c.pct7d, 1e6),
    pct30d: numOuNull(c.pct30d, 1e6),
    pctPosition: numOuNull(c.pctPosition, 1e6),
    traditionalEur: num(c.traditionalEur),
    stablecoinEur: num(c.stablecoinEur),
    score: score === undefined ? undefined : score,
    scoreParts: scoreParts.length ? scoreParts : undefined,
    roi: num(c.roi, 1e6),
    cagr: num(c.cagr, 1e6),
    sharpe: num(c.sharpe, 1e4),
    maxDrawdown: num(c.maxDrawdown, 1e4),
    volatility: num(c.volatility, 1e6),
    days: num(c.days, 1e5),
    allocations,
  };
}

// Entradas da distribuição que são agregados (não um ativo com cotação).
const AGREGADOS = new Set(["CEX", "DEFI", "TOKENS", "MANUAL", "USDT/USDC", "STABLECOINS"]);
const TICKER = /^[A-Z0-9]{2,10}$/;

/**
 * Símbolos para pedir preços ao mercado. Os ativos manuais chegam com o ticker
 * no rótulo e "Manual" no símbolo, e os agregados (CEX, DeFi, Tokens) não têm
 * cotação: escolhe-se o campo que for um ticker e saltam-se os agregados.
 */
export function simbolosDoContexto(ctx: PortfolioContext): string[] {
  const out = new Set<string>();
  for (const a of ctx.allocations) {
    for (const v of [a.symbol, a.label]) {
      const s = v.trim().toUpperCase();
      if (TICKER.test(s) && !AGREGADOS.has(s)) { out.add(s); break; }
    }
  }
  return [...out].slice(0, 20);
}

const PARTE: Record<string, string> = { diversification: "Diversificação", mix: "Mistura cripto/tradicional", stableReserve: "Reserva estável", roi: "Desempenho (ROI)", risk: "Gestão de risco" };

export function buildSystemPrompt(ctx: PortfolioContext, nickname = "", historico: string | null = null, mercado: string | null = null): string {
  const fmt = (n: number) => n.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sign = (n: number) => (n >= 0 ? `+€ ${fmt(n)}` : `-€ ${fmt(Math.abs(n))}`);
  const pc = (v: number | null | undefined) => (typeof v === "number" && Number.isFinite(v) ? ` (${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1).replace(".", ",")} %)` : "");

  const allocLines = ctx.allocations
    .filter((a) => a.valueEur > 0)
    .map((a) => `  • ${a.label} (${a.symbol}): € ${fmt(a.valueEur)} · ${a.percent}`)
    .join("\n");

  const metrics = [
    typeof ctx.roi === "number" ? `ROI: ${ctx.roi.toFixed(2)}%` : null,
    typeof ctx.cagr === "number" ? `CAGR: ${ctx.cagr.toFixed(2)}%` : null,
    typeof ctx.sharpe === "number" ? `Sharpe Ratio: ${ctx.sharpe.toFixed(2)}` : null,
    typeof ctx.maxDrawdown === "number" ? `Max Drawdown: ${ctx.maxDrawdown.toFixed(2)}%` : null,
    typeof ctx.volatility === "number" ? `Volatilidade anualizada: ${ctx.volatility.toFixed(2)}%` : null,
    typeof ctx.days === "number" ? `Período analisado: ${ctx.days} dias` : null,
  ].filter(Boolean).join("\n  ");

  const nome = limpo(nickname, 40);
  const nameLine = nome ? `\nNome do utilizador (trata-o por este nome de forma natural; não inventes outro):\n${dados("nome", nome, 40)}` : "";
  const extra = [
    typeof ctx.traditionalEur === "number" ? `  Mercado tradicional: € ${fmt(ctx.traditionalEur)}` : null,
    typeof ctx.stablecoinEur === "number" ? `  Stablecoins: € ${fmt(ctx.stablecoinEur)}` : null,
  ].filter(Boolean).join("\n");
  const scoreLinha = typeof ctx.score === "number"
    ? `\nPONTUAÇÃO DO PORTEFÓLIO (a mesma do ecrã): ${ctx.score}/100${ctx.scoreParts?.length ? " — " + ctx.scoreParts.map((p) => `${PARTE[p.id] ?? p.id} ${p.points}/${p.max}`).join(" · ") : ""}`
    : "";

  return `Tu és o Assistente IA do Portefólio, o analista pessoal do utilizador no ChainFolioAI. Tens os dados do portefólio dele tal como estão no ecrã:${nameLine}

PORTEFÓLIO ATUAL:
  Total: € ${fmt(ctx.totalEur)}
${extra ? extra + "\n" : ""}  Variação HOJE (últimas 24 h): ${sign(ctx.pnlToday)}${pc(ctx.pctToday)}
  Variação 7 DIAS: ${typeof ctx.pnl7d === "number" ? sign(ctx.pnl7d) + pc(ctx.pct7d) : "não disponível"}
  Variação 30 DIAS: ${sign(ctx.pnl30d)}${pc(ctx.pct30d)}
  (hoje/7/30 dias = posições atuais × preços de cada data, como na página; ativos sem preço histórico contam como constantes. São a ÚNICA fonte para estes três períodos.)
  PNL da posição (desde o 1.º snapshot, SEM o capital que entrou ou saiu ao ligar/remover carteiras): ${sign(ctx.pnlPosition)}${pc(ctx.pctPosition)}${scoreLinha}

MÉTRICAS AVANÇADAS (as do ecrã):
  ${metrics || "Não disponíveis (poucos snapshots)"}

DISTRIBUIÇÃO DE ATIVOS (entradas "CEX", "DeFi", "Tokens" e stablecoins são totais agregados; nos ativos manuais o ticker está no nome):
${allocLines ? dados("distribuicao", allocLines, 4000) : "  Sem ativos registados"}
${historico ? `\n${historico}\n(O histórico acima serve para períodos de 60 dias ou mais e para máximos, mínimos e valores de fim de mês.)\n` : ""}${mercado ? `\n${mercado}\n` : "\nMERCADO: sem preços ao vivo neste momento (não comentes preços nem movimentos de mercado de hoje).\n"}
INSTRUÇÕES:
- IDIOMA (regra crítica): Responde SEMPRE no mesmo idioma em que o utilizador escreveu a pergunta (inglês→inglês, espanhol→espanhol, francês→francês tratando por «vous», português→PT-PT). Deteta o idioma da pergunta; não assumas português por defeito.
- Responde de forma clara e objetiva, com os dados reais acima.
- Quando perguntarem "porque caiu/subiu", cruza a variação 24 h de cada ativo (secção de mercado acima) com o peso desse ativo no portefólio, e diz quais pesaram mais. Usa o período certo: "hoje" = variação de HOJE; "esta semana" = variação 7 DIAS; não confundas os dois.
- Por ativo só tens a variação de 24 h (secção de mercado). Para explicar uma variação de 7 ou 30 dias, NÃO uses essas variações de 24 h como se fossem da semana nem as ponhas numa tabela de "contribuição para a semana": diz que a variação semanal por ativo não está disponível. Se um ativo ou agregado não tem preço (ex.: DeFi), não afirmes que foi ele a causa; no máximo apresenta-o como hipótese, dizendo que é uma dedução.
- NUNCA inventes causas, notícias, regulação, "níveis de suporte", "correções após rallys" ou análise técnica que não estejam nos dados acima: não tens notícias nem gráficos. Se a causa não está nos números, diz que o movimento acompanha o mercado (ou o ativo X) e que não tens notícias.
- Saltos grandes de valor por ligar ou remover carteiras são capital que entrou ou saiu, não ganho: o PNL da posição e o histórico já os excluem.
- Quando perguntarem QUANTO subiu/desceu num período, usa os valores já calculados (€ e %); nunca peças valores antigos ao utilizador. Sem dados para o período, diz desde quando há histórico e dá o mais próximo.
- Nunca uses LaTeX (\\[, \\(, \\frac, \\text…): não é renderizado. Fórmulas em texto simples.
${NO_ADVICE_RULE}
${UNTRUSTED_DATA_RULE}
- Perguntas sobre a conta, o login, os planos ou como usar o site não são da tua área e não tens esses dados: responde numa ou duas frases que o Chain (botão Chat, em baixo à direita) ajuda com o site e que o suporte é suporte@chainfolioai.com. NUNCA inventes páginas, formulários, secções ou contactos.
- Se faltarem dados, diz o que precisas.
- Máximo 3 parágrafos curtos por resposta. Usa markdown simples (negrito, listas; tabelas só para dados).
- É uma conversa: podes referir-te às perguntas e respostas anteriores sem as repetir.`;
}
