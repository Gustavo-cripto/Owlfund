import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { chronoCompare, computeFifo, parseTrades, type Trade } from "@/lib/portfolios/trades";
import { metricas, seriePontos, variacoes, type PnlChange, type SnapRow } from "@/lib/api/pnlMath";
import { resumirImposto } from "@/lib/api/taxMath";
import { realizar, resumoAnualPolaco, type Operacao } from "@/lib/tax/metodos";
import { estimarImpostoPais, rotuloAnoFiscal, taxaMinima } from "@/lib/tax/regras";
import { ALTERNATIVA_EN, opcoesDoPais, validarOpcoes, type OpcoesEstimativa } from "@/lib/api/opcoesImposto";
import { loadFxServer } from "@/lib/api/fxServer";
import { COST_METHOD_LABEL, COST_METHOD_SHORT, fifoPorCarteira, metodoRessalva, moedaDoRelatorio, COUNTRIES } from "@/lib/tax/countries";

// Dois numeros que a app mostra e a API nao dava: a evolucao do portefolio
// (PNL) e as mais-valias realizadas pelo metodo FIFO.
//
// Os dados ja estavam no servidor — os snapshots em `portfolio_snapshots` e as
// transacoes dentro do blob de `wallet_config` — mas so eram lidos pelo browser.
// Sem isto, a ficha do MCP prometia numeros que nenhuma ferramenta devolvia.

// ── PNL ──────────────────────────────────────────────────────────────────────

export type PnlResult = {
  currency: "EUR";
  totalEur: number | null;
  updatedAt: string | null;
  changes: PnlChange[];
  snapshotsUsed: number;
  note: string;
};

export async function getPnl(userId: string): Promise<PnlResult> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("portfolio_snapshots")
    .select("created_at, data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(400);

  const serie = seriePontos((data ?? []) as SnapRow[]);
  const ultimo = serie[serie.length - 1] ?? null;
  const changes = variacoes(serie);

  return {
    currency: "EUR",
    totalEur: ultimo?.total ?? null,
    updatedAt: ultimo?.iso ?? null,
    changes,
    snapshotsUsed: serie.length,
    note: "Valores dos snapshots gravados na altura (nunca recalculados com preços de hoje). Um período fica a null quando não há snapshot suficientemente antigo.",
  };
}

// ── Mais-valias realizadas (FIFO) ────────────────────────────────────────────

export type RealizedGainsResult = {
  currency: "EUR";
  method: "FIFO";
  /** Ano civil pedido, ou null para tudo. */
  year: number | null;
  realizedPnlEur: number;
  feesEur: number;
  standaloneFeesEur: number;
  tradesCounted: number;
  byAsset: Array<{ asset: string; realizedPnlEur: number; feesEur: number; quantityOpen: number }>;
  byYear: Array<{ year: number; realizedPnlEur: number; sales: number }>;
  /** Vendas sem compra registada (quantidade por ativo) — o ganho dessas fica de fora. */
  unmatched: Record<string, number>;
  note: string;
};

type Blob = { data?: Record<string, Record<string, string>> };
const TRADES_KEY = "trade-history-v1";

/** Transacoes do utilizador, de todas as contas, como estao na nuvem. */
async function tradesDoUtilizador(userId: string): Promise<Trade[]> {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("wallet_config")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();

  const blob = (data?.data ?? null) as Blob | null;
  if (!blob?.data) return [];
  const out: Trade[] = [];
  for (const porConta of Object.values(blob.data)) {
    const raw = porConta?.[TRADES_KEY];
    if (typeof raw === "string") out.push(...parseTrades(raw).filter((t) => !t.deleted));
  }
  return out;
}

export async function getRealizedGains(userId: string, year?: number): Promise<RealizedGainsResult> {
  const trades = await tradesDoUtilizador(userId);
  // O FIFO corre sempre sobre o historico TODO — os lotes de uma venda de 2026
  // podem vir de compras de 2021. So depois se filtra o ano das vendas.
  const fifo = computeFifo(trades);

  const doAno = year != null
    ? fifo.lots.filter((l) => new Date(l.sellDate).getUTCFullYear() === year)
    : fifo.lots;

  const realizado = year != null
    ? doAno.reduce((s, l) => s + l.gain, 0)
    : fifo.realizedPnl;
  const taxas = year != null
    ? doAno.reduce((s, l) => s + l.fees, 0)
    : fifo.fees;

  const porAno = new Map<number, { realizedPnlEur: number; sales: number }>();
  for (const l of fifo.lots) {
    const a = new Date(l.sellDate).getUTCFullYear();
    const acc = porAno.get(a) ?? { realizedPnlEur: 0, sales: 0 };
    acc.realizedPnlEur += l.gain;
    acc.sales += 1;
    porAno.set(a, acc);
  }

  const byAsset = year != null
    ? Object.entries(
        doAno.reduce<Record<string, { realizedPnlEur: number; feesEur: number }>>((acc, l) => {
          const e = acc[l.asset] ?? { realizedPnlEur: 0, feesEur: 0 };
          e.realizedPnlEur += l.gain; e.feesEur += l.fees; acc[l.asset] = e;
          return acc;
        }, {}),
      ).map(([asset, v]) => ({ asset, ...v, quantityOpen: fifo.byAsset[asset]?.qtyNet ?? 0 }))
    : Object.entries(fifo.byAsset).map(([asset, v]) => ({
        asset, realizedPnlEur: v.realizedPnl, feesEur: v.fees, quantityOpen: v.qtyNet,
      }));

  return {
    currency: "EUR",
    method: "FIFO",
    year: year ?? null,
    realizedPnlEur: realizado,
    feesEur: taxas,
    standaloneFeesEur: fifo.standaloneFees,
    tradesCounted: trades.length,
    byAsset: byAsset.sort((a, b) => b.realizedPnlEur - a.realizedPnlEur),
    byYear: [...porAno.entries()].map(([y, v]) => ({ year: y, ...v })).sort((a, b) => a.year - b.year),
    unmatched: fifo.unmatched,
    note: "Ganhos realizados em euros, FIFO, com taxas e gás deduzidos. Não é uma declaração fiscal: a conversão para a moeda do país e as isenções vivem na página de Fiscalidade da app.",
  };
}

// ── Métricas avançadas ───────────────────────────────────────────────────────

export async function getMetrics(userId: string) {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("portfolio_snapshots")
    .select("created_at, data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(400);

  const serie = seriePontos((data ?? []) as SnapRow[]);
  const m = metricas(serie);
  return {
    currency: "EUR" as const,
    metrics: m,
    note: m
      ? "Calculado sobre os snapshots gravados. O 'atual' é o último snapshot, não o preço ao vivo — pode diferir ligeiramente do ecrã. CAGR só a partir de 90 dias; saltos acima de ±50 % entre capturas (depósitos/levantamentos) ficam de fora das métricas de risco."
      : "Sem snapshots suficientes: são precisas pelo menos duas capturas em dias diferentes.",
  };
}

// ── Transações ───────────────────────────────────────────────────────────────

export async function getTrades(userId: string, opts: { asset?: string; year?: number; limit?: number } = {}) {
  const todas = await tradesDoUtilizador(userId);
  const limite = Math.min(Math.max(opts.limit ?? 100, 1), 500);
  const asset = opts.asset?.toUpperCase();

  const filtradas = todas
    .filter((t) => (asset ? t.asset.toUpperCase() === asset : true))
    .filter((t) => (opts.year != null ? new Date(t.date).getUTCFullYear() === opts.year : true))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  return {
    currency: "EUR" as const,
    total: filtradas.length,
    returned: Math.min(filtradas.length, limite),
    trades: filtradas.slice(0, limite).map((t) => ({
      date: t.date,
      type: t.type,              // compra | venda | taxa
      asset: t.asset,
      quantity: t.quantity,
      priceEur: t.priceEur,
      totalEur: t.totalEur,
      feeEur: t.feeEur ?? 0,
      feeAsset: t.feeAsset ?? null,
      exchange: t.exchange ?? null,
    })),
    note: "Transações registadas pelo utilizador, em euros, da mais recente para a mais antiga.",
  };
}

// ── Estimativa de imposto por país ───────────────────────────────────────────

export async function getTaxEstimate(userId: string, countryCode: string, year?: number, opcoes: OpcoesEstimativa = {}) {
  const pais = COUNTRIES.find((c) => c.code === countryCode.toUpperCase());
  if (!pais) {
    return { error: "unknown_country", message: `País desconhecido: ${countryCode}. Use list_tax_countries para ver os códigos disponíveis.` };
  }
  const alt = pais.regras?.alternativa;
  const tm = pais.regras?.taxaMarginal;
  const v = validarOpcoes(pais, opcoes);
  if ("error" in v) return v;
  const { alternativa, taxaPessoal } = v;

  const trades = await tradesDoUtilizador(userId);
  // Moeda em que o relatório pode mesmo sair: há países cuja moeda o BCE não
  // publica, e nesses o relatório cai para euros COM AVISO, em vez de devolver
  // zero por ter descartado tudo.
  const { currency: moeda, fallback: moedaEmFalta } = moedaDoRelatorio(pais);
  const ordenadas = trades.filter((t) => !t.deleted).sort(chronoCompare);
  // Uma só chamada de câmbios para todas as datas envolvidas.
  const fx = await loadFxServer([...new Set(ordenadas.map((t) => t.date))], moeda);

  // Converter CADA operacao a moeda do relatorio a taxa da SUA data ANTES do
  // motor (auditoria 30 set 2026): nos metodos de custo medio o preco do lote
  // e uma mistura de compras em datas diferentes, e convertê-lo depois, a taxa
  // da primeira data, dava um numero diferente do da pagina. Operacoes sem
  // cambio ficam de fora e contam-se — nunca um total feito de um pedaco.
  const ops: Operacao[] = [];
  let droppedOps = 0;
  for (const t of ordenadas) {
    if (t.type === "taxa") {
      const valor = fx.fromEur(t.totalEur, t.date);
      if (valor == null) { droppedOps++; continue; }
      ops.push({ type: "taxa", asset: t.asset, amount: t.quantity, price: t.quantity > 0 ? valor / t.quantity : 0, fee: 0, date: t.date, carteira: t.exchange });
      continue;
    }
    const preco = fx.fromEur(t.priceEur, t.date);
    const taxa = (t.feeEur ?? 0) > 0 ? fx.fromEur(t.feeEur ?? 0, t.date) : 0;
    if (preco == null || taxa == null) { droppedOps++; continue; }
    ops.push({ type: t.type, asset: t.asset, amount: t.quantity, price: preco, fee: taxa, date: t.date, carteira: t.exchange, ...(t.swapId ? { swapId: t.swapId } : {}), ...(t.feeAsset && (t.feeInput ?? 0) > 0 ? { feeAsset: t.feeAsset, feeQty: t.feeInput ?? 0 } : {}) });
  }
  // PT com contraparte fora da UE/convenção: as trocas deixam de ser neutras (como na página).
  const todos = realizar(ops, pais.costMethod, { permutaNeutra: pais.regras?.permutaNeutra && !(alternativa && alt?.trocasTributadas), porCarteira: fifoPorCarteira(pais) }).lotes;
  // Regras do país (prazo por calendário, regras do ano da venda, escalas,
  // isenções por vendas, ano fiscal GB/AU…): o mesmo módulo que a página.
  // Sem taxa pessoal, usa-se a taxa máxima onde ela depende do rendimento.
  let est: ReturnType<typeof estimarImpostoPais> = estimarImpostoPais(todos, pais, year, { alternativa, taxaPessoal });
  const lots = todos.filter((l) => est.events.some((e) => e.sellDate === l.sellDate && e.buyDate === l.buyDate && e.asset === l.asset));
  // Polonia: a base do ano e receitas menos TODOS os custos do ano, com o
  // excedente a transitar (art. 30b ust. 1a PIT) — o mesmo que a pagina faz.
  const anual = pais.costMethod === "annual" ? resumoAnualPolaco(ops) : null;
  if (anual) {
    const anos = year != null ? anual.filter((a) => a.ano === year) : anual;
    const eventos = anos.map((a) => ({ gain: a.base > 0 ? a.base : a.receitas - a.custos - a.custosTransitados, taxRate: pais.regime.short }));
    const parciais = eventos.map((e) => resumirImposto([e], pais.regime));
    const soma = (f: (r: typeof parciais[number]) => number) => Math.round(parciais.reduce((acc, r) => acc + f(r), 0) * 100) / 100;
    est = { ...est, totalGain: soma((r) => r.totalGain), taxable: soma((r) => r.taxable), exempt: soma((r) => r.exempt), losses: soma((r) => r.losses), deductibleLosses: soma((r) => r.deductibleLosses), lossesApplied: soma((r) => r.lossesApplied), allowanceUsed: soma((r) => r.allowanceUsed), tax: soma((r) => r.tax), fees: Math.round(anos.reduce((acc, a) => acc + a.taxas, 0) * 100) / 100 };
  }
  const droppedLots = est.droppedLots + droppedOps;
  // Sem a taxa da pessoa: o imposto também com o escalão mais baixo (intervalo).
  const minima = tm && taxaPessoal?.curto == null && !anual ? taxaMinima(pais) : undefined;
  const estMin = minima
    ? estimarImpostoPais(todos, pais, year, { alternativa, taxaPessoal: { ...minima, ...(taxaPessoal?.longo != null ? { longo: taxaPessoal.longo } : {}) } })
    : null;

  // Um total calculado sobre um subconjunto é pior do que um erro: se algum
  // lote ficou de fora por falta de câmbio, o imposto vai a null.
  const parcial = droppedLots > 0;

  return {
    country: pais.code,
    currency: moeda,
    ...(moedaEmFalta ? { currencyNote: `Não há taxa de câmbio oficial publicada para ${pais.currency}; os valores saem em EUR.` } : {}),
    year: year ?? null,
    ...(pais.regras?.anoFiscalInicio ? { taxYear: year != null ? rotuloAnoFiscal(pais, year) : null, taxYearNote: `Tax year starts on ${pais.regras.anoFiscalInicio.split("-").reverse().join("/")}; \`year\` is the year in which the tax year starts.` } : {}),
    law: pais.law,
    costMethod: pais.costMethod,
    costMethodLabel: COST_METHOD_LABEL[pais.costMethod].en,
    ...(metodoRessalva(pais.costMethod, "en", pais.code) ? { costMethodNote: metodoRessalva(pais.costMethod, "en", pais.code) } : {}),
    // Escolhas usadas: quem chama sabe com que pressupostos saiu o número.
    assumptions: {
      ...(alt ? { alternative: alternativa, meaning: alternativa ? ALTERNATIVA_EN[alt.id].alternative : ALTERNATIVA_EN[alt.id].default } : {}),
      ...(tm ? { marginalRate: taxaPessoal?.curto ?? null, ...(tm.longo === "separado" ? { marginalRateLong: taxaPessoal?.longo ?? null } : {}) } : {}),
    },
    ...(tm ? { rateNote: taxaPessoal?.curto != null ? "Uses the marginal rate you provided." : "The rate depends on income; without marginalRate, estimatedTax uses the top rate (with surcharges) and estimatedTaxRange goes from the lowest to the highest bracket." } : {}),
    ...(alt ? { assumptionNote: `${ALTERNATIVA_EN[alt.id][alternativa ? "alternative" : "default"]} Pass alternative=${alternativa ? "false" : "true"} for the other case.` } : {}),
    ...(pais.regime.allowance?.disputada ? { allowanceNote: "The annual exemption shown in the guide is not applied: its application to crypto is not confirmed by the tax authority." } : {}),
    rates: { short: pais.regime.short, long: pais.regime.long, longTermAfterDays: pais.regime.longDays },
    allowance: pais.regime.allowance
      ? { amount: pais.regime.allowance.amount, kind: pais.regime.allowance.kind, used: est.allowanceUsed }
      : null,
    sales: est.events.length,
    totalGain: est.totalGain,
    taxableGain: est.taxable,
    exemptGain: est.exempt,
    losses: est.losses,
    deductibleLosses: est.deductibleLosses,
    lossesOffset: est.lossesApplied,
    feesDeducted: est.fees,
    ...(pais.regras?.perdasTransitam ? {
      carriedLossesUsed: est.carriedLossesUsed,
      lossesCarriedForward: est.lossesCarriedForward,
      ...(pais.regras.perdasTransitam.modo === "us" ? { ordinaryIncomeDeduction: est.ordinaryIncomeDeduction } : {}),
      carryForwardNote: "Unused losses carry forward to later years" + (pais.regras.perdasTransitam.anos ? ` (up to ${pais.regras.perdasTransitam.anos} years)` : "") + ". Only losses recorded in ChainFolioAI are known; losses from before the first record are not included." + (pais.regras.perdasTransitam.modo === "us" ? " Up to $3,000 of net loss per year is deducted from other income (not in estimatedTax)." : ""),
    } : {}),
    estimatedTax: parcial ? null : est.tax,
    ...(estMin ? { estimatedTaxRange: parcial ? null : { min: estMin.tax, max: est.tax } } : {}),
    incompleteFx: fx.incomplete,
    droppedLots,
    ...(parcial ? { warning: `${droppedLots} de ${ops.length + droppedOps} operações ficaram sem taxa de câmbio; o imposto não é calculado sobre parte dos dados.` } : {}),
    note: `ESTIMATIVA, não uma declaração. Método de custo do país: ${COST_METHOD_SHORT[pais.costMethod]} (${COST_METHOD_LABEL[pais.costMethod].en}); cada compra e cada venda convertida à taxa do BCE da sua data; taxa de longo prazo aplicada conforme os dias de detenção; menos-valias abatidas às mais-valias do MESMO ano (e, onde a lei deixa, as que sobram passam aos anos seguintes; uma perda num ativo isento não é dedutível); isenção anual do país aplicada por fim, ao saldo já compensado. Não cobre situações pessoais (residência parcial, englobamento, deduções próprias). Confirme com um contabilista.`,
  };
}

// ── Regimes fiscais publicados ───────────────────────────────────────────────

export function listTaxCountries() {
  return {
    total: COUNTRIES.length,
    countries: COUNTRIES.map((c) => ({
      code: c.code,
      currency: c.currency,
      law: c.law,
      shortTermRate: c.regime.short,
      longTermRate: c.regime.long,
      longTermAfterDays: c.regime.longDays,
      annualAllowance: c.regime.allowance ? { amount: c.regime.allowance.amount, kind: c.regime.allowance.kind } : null,
      costMethod: c.costMethod,
      options: opcoesDoPais(c),
      guide: `${process.env.NEXT_PUBLIC_SITE_URL ?? "https://chainfolioai.com"}/guides/crypto-tax/${c.slug.en}`,
    })),
    note: "Regras gerais publicadas nos guias do ChainFolioAI, verificadas para 2026. Taxas em fração (0.28 = 28 %). Não é aconselhamento fiscal.",
  };
}

// ── Pontuação do portefólio ──────────────────────────────────────────────────

const PARTE_LABEL: Record<string, string> = {
  diversification: "Diversificação",
  mix: "Mistura cripto / tradicional",
  stableReserve: "Reserva em stablecoins",
  roi: "Desempenho (ROI)",
  risk: "Gestão de risco",
};

/**
 * Devolve a pontuação TAL COMO foi mostrada no ecrã: é gravada dentro do
 * snapshot pela página do Portefólio (`_score`), não recalculada aqui. Duas
 * contas separadas para o mesmo número acabam sempre por divergir — e um
 * cliente a ver 72 na app e 68 no assistente não sabe em qual acreditar.
 */
export async function getScore(userId: string) {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("portfolio_snapshots")
    .select("created_at, data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(30);

  type Guardado = { value: number; parts: Array<{ id: string; points: number; max: number }> };
  const linha = ((data ?? []) as Array<{ created_at: string; data: unknown }>)
    .find((r) => (r.data as { _score?: Guardado } | null)?._score != null);
  const guardado = (linha?.data as { _score?: Guardado } | undefined)?._score;

  if (!guardado) {
    return {
      score: null,
      asOf: null,
      parts: [],
      note: "Ainda não há pontuação gravada nesta conta. Abre o Portefólio no site uma vez: a pontuação é calculada no ecrã e fica guardada no snapshot seguinte.",
    };
  }

  return {
    score: guardado.value,
    max: 100,
    asOf: linha?.created_at ?? null,
    parts: guardado.parts.map((p) => ({
      id: p.id,
      label: PARTE_LABEL[p.id] ?? p.id,
      points: p.points,
      max: p.max,
    })),
    note: "Pontuação 0–100 tal como aparece na app (diversificação 30, mistura 20, reserva estável 10, desempenho 20, risco 20). É um apoio à leitura do portefólio, não uma recomendação de compra ou venda.",
  };
}
