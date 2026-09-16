import type { SupabaseClient } from "@supabase/supabase-js";

// Snapshots repetidos no mesmo dia: fica o ULTIMO de cada dia (hora de
// Lisboa), por utilizador e por conta; os outros saem.
//
// Porque existem: ate 16 set 2026 o auto-snapshot da pagina do portefolio
// decidia "ultimo ha 24 h+" com a lista ainda por carregar e guardava um por
// visita — uma conta chegou a mais de mil. Todas as metricas ja usam um por
// dia (o ultimo), por isso apagar os repetidos nao muda nenhum numero.
//
// `olderThanDays`: so mexe em dias ja fechados (por omissao, a partir de
// ontem), para nunca apagar o snapshot que alguem acabou de guardar hoje.

const TZ = "Europe/Lisbon";
const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD

export type DedupeReport = { scanned: number; toDelete: number; deleted: number; byUser: Record<string, { scanned: number; toDelete: number }> };

export async function dedupeSnapshots(admin: SupabaseClient, opts: { apply: boolean; olderThanDays?: number; userId?: string }): Promise<DedupeReport> {
  const cutoff = new Date(Date.now() - (opts.olderThanDays ?? 1) * 86_400_000).toISOString();
  type Row = { id: number; user_id: string; created_at: string; account: string | null };
  const rows: Row[] = [];
  // Leitura paginada (o PostgREST devolve no maximo 1000 por pedido); so as colunas precisas.
  for (let from = 0; ; from += 1000) {
    let q = admin.from("portfolio_snapshots").select("id, user_id, created_at, account:data->>_account").lt("created_at", cutoff).order("created_at", { ascending: true }).range(from, from + 999);
    if (opts.userId) q = q.eq("user_id", opts.userId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as Row[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  // Por utilizador+conta+dia, o ultimo fica; os anteriores vao para a lista.
  const latest = new Map<string, Row>();
  const del: number[] = [];
  const byUser: DedupeReport["byUser"] = {};
  for (const r of rows) {
    const u = (byUser[r.user_id] ??= { scanned: 0, toDelete: 0 });
    u.scanned++;
    const key = `${r.user_id}|${r.account ?? ""}|${dayKey(r.created_at)}`;
    const prev = latest.get(key);
    if (prev) { del.push(prev.id); u.toDelete++; }   // rows vem por ordem crescente: o anterior e o mais velho
    latest.set(key, r);
  }
  let deleted = 0;
  if (opts.apply) {
    for (let i = 0; i < del.length; i += 500) {
      const chunk = del.slice(i, i + 500);
      const { error, count } = await admin.from("portfolio_snapshots").delete({ count: "exact" }).in("id", chunk);
      if (error) throw new Error(error.message);
      deleted += count ?? chunk.length;
    }
  }
  return { scanned: rows.length, toDelete: del.length, deleted, byUser };
}
