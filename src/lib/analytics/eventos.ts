// Momentos do percurso (funil), guardados na MESMA tabela das visitas
// (page_views) como "paginas virtuais" /_ev/<nome>. Sem tabela nova, sem dados
// pessoais (so o nome do momento, a marca de robo e a origem ?src=), e ja
// apanhados pela limpeza automatica de 90 dias do cron `cleanup`.
//
// As estatisticas de paginas (topPaths, totais de visitas) excluem o prefixo
// /_ev/ — ver src/app/api/v1/admin/stats/route.ts e src/lib/analytics/funil.ts.
export const PREFIXO_EVENTO = "/_ev/";

/** Nomes aceites. Tudo o resto e ignorado (a rota e publica). */
// cta_*: cada botão da página inicial à parte (hero, planos, final, demonstração);
// cta_hero foi o botão PRINCIPAL do topo até 14 out 2026; desde então o topo abre
// com a demonstração e o "Criar conta grátis" secundário grava cta_criar_conta
// (corte limpo: uma série não muda de significado a meio).
// email_confirmado: o passo do registo que faltava medir (gravado pelo servidor).
// carteiras_*/carteira_* (18 out 2026): o passo da ativação, por dentro — chegou
// às Carteiras, tentou juntar uma carteira, conseguiu, ou que erro teve.
export const EVENTOS = ["experimentar", "registo", "exemplo", "exemplo_auto", "cta_hero", "cta_criar_conta", "cta_planos", "cta_final", "cta_demo", "email_confirmado",
  "carteiras_vistas", "carteira_tentativa", "carteira_ok", "carteira_erro_formato", "carteira_erro_chave", "carteira_erro_limite", "carteira_erro_repetida", "carteira_erro_outro"] as const;
export type ErroCarteira = "formato" | "chave" | "limite" | "repetida" | "outro";
export type Evento = (typeof EVENTOS)[number];
export const eEvento = (x: unknown): x is Evento => typeof x === "string" && (EVENTOS as readonly string[]).includes(x);

/** Do lado do browser: regista um momento. Nunca falha, nunca bloqueia. */
export function marcarEvento(nome: Evento): void {
  try {
    if (typeof window === "undefined") return;
    const corpo = JSON.stringify({ e: nome });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/evento", new Blob([corpo], { type: "application/json" }));
    else void fetch("/api/evento", { method: "POST", headers: { "Content-Type": "application/json" }, body: corpo, keepalive: true }).catch(() => {});
  } catch { /* medir nunca pode partir a pagina */ }
}
