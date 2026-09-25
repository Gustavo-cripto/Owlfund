import type { SupabaseClient } from "@supabase/supabase-js";
import { PREFIXO_EVENTO } from "@/lib/analytics/eventos";

// Funil de ponta a ponta, so com pessoas (is_bot = false):
//   visitas a pagina inicial → usaram "experimentar" → submeteram registo →
//   contas criadas → contas com carteira → voltaram depois de 7 dias.
// Os dois primeiros e o terceiro vem de page_views; o resto de auth.users e
// wallet_config. Nada aqui identifica ninguem: so contagens.
export type Etapas = { paginaInicial: number | null; experimentar: number | null; registo: number | null; contas: number | null; comCarteira: number | null };
export type Funil = {
  d7: Etapas;
  d30: Etapas;
  /** Coorte: contas criadas ha 7–37 dias; quantas voltaram 7+ dias depois de criar conta. */
  retencao7d: { coorte: number; voltaram: number } | null;
  geradoEm: string;
};

const INICIAIS = ["/", "/en", "/es", "/fr"];
// Um endereco publico qualquer dentro do JSON guardado das carteiras.
export const TEM_ENDERECO = /0x[a-fA-F0-9]{40}|\b(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,}\b|\baddr1[0-9a-z]{20,}|\bstake1[0-9a-z]{20,}|\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;

export async function calcularFunil(admin: SupabaseClient): Promise<Funil> {
  const agora = Date.now();
  const desde = (d: number) => new Date(agora - d * 86_400_000).toISOString();
  const contar = async (q: PromiseLike<{ count: number | null; error: unknown }>) => {
    try { const r = await q; return r.error ? null : r.count ?? 0; } catch { return null; }
  };
  const vistas = (dias: number, filtro: (q: ReturnType<typeof base>) => ReturnType<typeof base>) => contar(filtro(base()).gte("created_at", desde(dias)));
  const base = () => admin.from("page_views").select("*", { count: "exact", head: true }).eq("is_bot", false);

  // Contas: uma listagem, e daqui sai tudo o que depende de auth.users.
  type U = { id: string; criada: number; ultimo: number };
  const users: U[] = [];
  let listagemOk = true;
  try {
    for (let page = 1; page <= 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) { listagemOk = false; break; }
      for (const u of data.users) {
        const criada = u.created_at ? new Date(u.created_at).getTime() : 0;
        const carimbos = [u.last_sign_in_at, (u.user_metadata as Record<string, unknown> | null)?.last_seen_at]
          .filter((x): x is string => typeof x === "string").map((x) => new Date(x).getTime());
        users.push({ id: u.id, criada, ultimo: carimbos.length ? Math.max(...carimbos) : criada });
      }
      if (data.users.length < 1000) break;
    }
  } catch { listagemOk = false; }

  // Quem tem pelo menos um endereco guardado (so contas dos ultimos 30 dias).
  const recentes = users.filter((u) => u.criada >= agora - 30 * 86_400_000);
  const comCarteira = new Set<string>();
  if (recentes.length) {
    try {
      const ids = recentes.map((u) => u.id);
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await admin.from("wallet_config").select("user_id, data").in("user_id", ids.slice(i, i + 200));
        for (const r of data ?? []) if (TEM_ENDERECO.test(JSON.stringify(r.data ?? ""))) comCarteira.add(r.user_id as string);
      }
    } catch { /* fica a zero, sem partir o resto */ }
  }

  const etapas = async (dias: number): Promise<Etapas> => {
    const corte = agora - dias * 86_400_000;
    const naJanela = users.filter((u) => u.criada >= corte);
    const [paginaInicial, experimentar, registo] = await Promise.all([
      vistas(dias, (q) => q.in("path", INICIAIS)),
      vistas(dias, (q) => q.eq("path", `${PREFIXO_EVENTO}experimentar`)),
      vistas(dias, (q) => q.eq("path", `${PREFIXO_EVENTO}registo`)),
    ]);
    return {
      paginaInicial, experimentar, registo,
      contas: listagemOk ? naJanela.length : null,
      comCarteira: listagemOk ? naJanela.filter((u) => comCarteira.has(u.id)).length : null,
    };
  };

  const coorte = users.filter((u) => u.criada <= agora - 7 * 86_400_000 && u.criada >= agora - 37 * 86_400_000);
  const [d7, d30] = await Promise.all([etapas(7), etapas(30)]);
  return {
    d7, d30,
    retencao7d: listagemOk ? { coorte: coorte.length, voltaram: coorte.filter((u) => u.ultimo >= u.criada + 7 * 86_400_000).length } : null,
    geradoEm: new Date(agora).toISOString(),
  };
}
