import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeFifo, parseTrades, type Trade } from "@/lib/portfolios/trades";
import { seriePontos, variacoes, type PnlChange, type SnapRow } from "@/lib/api/pnlMath";

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
