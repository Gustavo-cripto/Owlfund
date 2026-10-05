// Lê as fotografias do portefólio na base de dados e devolve o texto de
// histórico para os assistentes de IA (ver src/lib/ai/historicoTexto.ts).
//
// Só se pedem as duas colunas que interessam (total e conta de cada fotografia),
// não o blob inteiro das carteiras: uma conta com um ano de fotografias diárias
// são centenas de linhas e o blob traz listas de carteiras e tokens.

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { SnapRow } from "@/lib/api/pnlMath";
import type { Plan } from "@/lib/api/entitlement";
import { diasDaJanela, inicioDaJanela } from "@/lib/portfolio/posicao";
import { textoHistorico, textoSemHistorico } from "@/lib/ai/historicoTexto";

type LinhaLeve = { created_at: string; total: unknown; account: unknown };

/** Linhas da janela do plano, já no formato que pnlMath/historicoTexto esperam. */
export async function lerFotografias(userId: string, plan: Plan): Promise<SnapRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("portfolio_snapshots")
    .select("created_at, total:data->_totalEur, account:data->_account")
    .eq("user_id", userId)
    .gte("created_at", inicioDaJanela(plan))
    .not("data->_totalEur", "is", null)
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as LinhaLeve[]).map((r) => ({
    created_at: r.created_at,
    data: { _totalEur: r.total, _account: r.account },
  }));
}

/**
 * Texto de histórico para o prompt. Nunca lança: em erro de base de dados
 * devolve null e o bot responde só com o valor atual (como antes).
 */
export async function historicoParaIa(opts: {
  userId: string;
  plan: Plan;
  accountId: string;
  totalAtual?: number | null;
  locale?: string;
}): Promise<string | null> {
  try {
    const rows = await lerFotografias(opts.userId, opts.plan);
    return (
      textoHistorico(rows, opts.accountId, { totalAtual: opts.totalAtual, locale: opts.locale, diasDoPlano: diasDaJanela(opts.plan) })
      ?? textoSemHistorico()
    );
  } catch (e) {
    console.error("[ia/historico] fotografias indisponíveis:", e instanceof Error ? e.message : e);
    return null;
  }
}
