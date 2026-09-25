// Momentos do percurso (funil), guardados na MESMA tabela das visitas
// (page_views) como "paginas virtuais" /_ev/<nome>. Sem tabela nova, sem dados
// pessoais (so o nome do momento, a marca de robo e a origem ?src=), e ja
// apanhados pela limpeza automatica de 90 dias do cron `cleanup`.
//
// As estatisticas de paginas (topPaths, totais de visitas) excluem o prefixo
// /_ev/ — ver src/app/api/v1/admin/stats/route.ts e src/lib/analytics/funil.ts.
export const PREFIXO_EVENTO = "/_ev/";

/** Nomes aceites. Tudo o resto e ignorado (a rota e publica). */
export const EVENTOS = ["experimentar", "registo"] as const;
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
