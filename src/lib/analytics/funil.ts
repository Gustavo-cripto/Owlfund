import type { SupabaseClient } from "@supabase/supabase-js";
import { PREFIXO_EVENTO } from "@/lib/analytics/eventos";

// Funil de ponta a ponta, so com pessoas (is_bot = false):
//   visitas a pagina inicial → usaram "experimentar" → submeteram registo →
//   contas criadas → contas com carteira → voltaram depois de 7 dias.
// Os dois primeiros e o terceiro vem de page_views; o resto de auth.users e
// wallet_config. Nada aqui identifica ninguem: so contagens.
export type Etapas = {
  paginaInicial: number | null;
  /** Cliques nos botões da página inicial, cada um à parte. */
  cta: { hero: number | null; planos: number | null; final: number | null; demo: number | null };
  experimentar: number | null;
  registo: number | null;
  /** Emails confirmados (passo gravado pelo servidor em /api/auth/confirm). */
  emailConfirmado: number | null;
  contas: number | null;
  comCarteira: number | null;
  /** Contas que carregaram o modo de exemplo. */
  exemplo: number | null;
};
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

// Chaves do blob de wallet_config que guardam ativos registados a mao (cripto,
// tradicional, corretoras sem API). Nao tem enderecos, por isso a regex acima
// nao os apanha — e uma conta so com ETFs a mao contava como "vazia".
const CHAVES_MANUAIS = ["owlfund.crypto.holdings.v1", "owlfund.traditional.holdings.v1", "owlfund.venue.holdings.v1"];

const naoVazio = (x: unknown): boolean => {
  let v = x;
  if (typeof v === "string") { try { v = JSON.parse(v); } catch { return false; } }
  if (Array.isArray(v)) return v.length > 0;
  return !!v && typeof v === "object" && Object.keys(v as object).length > 0;
};

/**
 * "Tem dados" = pelo menos um endereco on-chain OU um registo manual nao vazio,
 * em qualquer conta do blob (v3, v2 ou o formato antigo — percorre a arvore
 * toda em vez de assumir a forma). Partilhado pelo cron de emails e pelo funil,
 * para os dois contarem a mesma coisa. Chaves de corretora vivem noutra tabela
 * (cex_keys): quem chama junta-as por fora.
 */
/** Retira as carteiras do modo de exemplo (`source: "demo"`) — não são do utilizador. */
export function semExemplo(raiz: unknown): unknown {
  if (Array.isArray(raiz)) return raiz.filter((x) => !(x && typeof x === "object" && (x as { source?: unknown }).source === "demo")).map(semExemplo);
  if (raiz && typeof raiz === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raiz as Record<string, unknown>)) {
      // Os valores por conta vêm como JSON em texto; abre-se, limpa-se, fecha-se.
      if (typeof v === "string" && v.startsWith("{")) { try { out[k] = JSON.stringify(semExemplo(JSON.parse(v))); continue; } catch { /* fica como está */ } }
      out[k] = semExemplo(v);
    }
    return out;
  }
  return raiz;
}

export function temDados(blob: unknown): boolean {
  if (blob == null) return false;
  let raiz: unknown = blob;
  if (typeof blob === "string") { try { raiz = JSON.parse(blob); } catch { return TEM_ENDERECO.test(blob); } }
  raiz = semExemplo(raiz);
  if (TEM_ENDERECO.test(JSON.stringify(raiz))) return true;
  const fila: unknown[] = [raiz];
  let passos = 0;
  while (fila.length && passos++ < 5000) {
    const atual = fila.pop();
    if (!atual || typeof atual !== "object") continue;
    for (const [k, v] of Object.entries(atual as Record<string, unknown>)) {
      if (CHAVES_MANUAIS.includes(k) && naoVazio(v)) return true;
      if (v && typeof v === "object") fila.push(v);
    }
  }
  return false;
}

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

  // Quem tem pelo menos um endereco, um registo manual ou uma chave de
  // corretora (so contas dos ultimos 30 dias). Mesma regra do cron de emails.
  const recentes = users.filter((u) => u.criada >= agora - 30 * 86_400_000);
  const comCarteira = new Set<string>();
  if (recentes.length) {
    try {
      const ids = recentes.map((u) => u.id);
      for (let i = 0; i < ids.length; i += 200) {
        const lote = ids.slice(i, i + 200);
        const { data } = await admin.from("wallet_config").select("user_id, data").in("user_id", lote);
        for (const r of data ?? []) if (temDados(r.data)) comCarteira.add(r.user_id as string);
        const { data: cex } = await admin.from("cex_keys").select("user_id").in("user_id", lote);
        for (const r of cex ?? []) comCarteira.add(r.user_id as string);
      }
    } catch { /* fica a zero, sem partir o resto */ }
  }

  const etapas = async (dias: number): Promise<Etapas> => {
    const corte = agora - dias * 86_400_000;
    const naJanela = users.filter((u) => u.criada >= corte);
    const ev = (nome: string) => vistas(dias, (q) => q.eq("path", `${PREFIXO_EVENTO}${nome}`));
    const [paginaInicial, experimentar, registo, emailConfirmado, exemplo, hero, planos, final, demo] = await Promise.all([
      vistas(dias, (q) => q.in("path", INICIAIS)),
      ev("experimentar"), ev("registo"), ev("email_confirmado"), ev("exemplo"), ev("cta_hero"), ev("cta_planos"), ev("cta_final"), ev("cta_demo"),
    ]);
    return {
      paginaInicial, cta: { hero, planos, final, demo }, experimentar, registo, emailConfirmado, exemplo,
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
