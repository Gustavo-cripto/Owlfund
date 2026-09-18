import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeFifo, parseTrades, type Trade } from "@/lib/portfolios/trades";
import { metricas, seriePontos, variacoes, type PnlChange, type SnapRow } from "@/lib/api/pnlMath";
import { estimarImposto } from "@/lib/api/taxMath";
import { loadFxServer } from "@/lib/api/fxServer";
import { COUNTRIES } from "@/lib/tax/countries";

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

export async function getTaxEstimate(userId: string, countryCode: string, year?: number) {
  const pais = COUNTRIES.find((c) => c.code === countryCode.toUpperCase());
  if (!pais) {
    return { error: "unknown_country", message: `País desconhecido: ${countryCode}. Use list_tax_countries para ver os códigos disponíveis.` };
  }

  const trades = await tradesDoUtilizador(userId);
  const fifo = computeFifo(trades);
  const lots = year != null
    ? fifo.lots.filter((l) => new Date(l.sellDate).getUTCFullYear() === year)
    : fifo.lots;

  // Uma só chamada de câmbios para todas as datas envolvidas.
  const datas = [...new Set(lots.flatMap((l) => [l.buyDate, l.sellDate]))];
  const fx = await loadFxServer(datas, pais.currency);
  const est = estimarImposto(lots, pais.regime, (eur, data) => fx.fromEur(eur, data));

  return {
    country: pais.code,
    currency: pais.currency,
    year: year ?? null,
    law: pais.law,
    rates: { short: pais.regime.short, long: pais.regime.long, longTermAfterDays: pais.regime.longDays },
    allowance: pais.regime.allowance
      ? { amount: pais.regime.allowance.amount, kind: pais.regime.allowance.kind, used: est.allowanceUsed }
      : null,
    sales: est.events.length,
    totalGain: est.totalGain,
    taxableGain: est.taxable,
    exemptGain: est.exempt,
    losses: est.losses,
    feesDeducted: est.fees,
    estimatedTax: est.tax,
    incompleteFx: fx.incomplete,
    note: "ESTIMATIVA, não uma declaração. Método FIFO; cada compra e cada venda convertida à taxa do BCE da sua data; taxa de longo prazo aplicada conforme os dias de detenção; isenção anual do país aplicada ao tributável. Não cobre situações pessoais (residência parcial, englobamento, deduções próprias). Confirme com um contabilista.",
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
