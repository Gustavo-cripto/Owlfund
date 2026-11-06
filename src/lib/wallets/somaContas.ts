// Totais da vista "Todas", no browser (storage.ts) e na API (walletBlob.ts).
//
// As exchanges e a Hyperliquid são da pessoa, não de um portefólio: cada
// portefólio visitado em Carteiras guarda o mesmo valor, e somá-lo contava-o
// uma vez por portefólio (auditoria 6 nov 2026). As corretoras à mão, essas,
// são por portefólio: é o `venueUsd`, a parte do `cexUsd` que se soma.

export type ParcelasConta = {
  cexUsd?: unknown;
  venueUsd?: unknown;
  cexEm?: unknown;
  defiUsd?: unknown;
  defiPosicoes?: unknown;
};

const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export function somarExchanges(contas: ParcelasConta[]): number | undefined {
  let corretoras = 0;
  let exchanges: number | undefined;
  let exchangesEm = -1;
  for (const c of contas) {
    const cex = num(c.cexUsd);
    if (cex === undefined) continue;
    const venue = Math.min(Math.max(num(c.venueUsd) ?? 0, 0), Math.max(cex, 0));
    corretoras += venue;
    const global = cex - venue;
    const em = num(c.cexEm) ?? 0;
    // A leitura mais recente manda; sem data (gravações antigas), fica a maior.
    if (exchanges === undefined || em > exchangesEm || (em === exchangesEm && global > exchanges)) {
      exchanges = global;
      exchangesEm = em;
    }
  }
  return exchanges === undefined ? undefined : corretoras + exchanges;
}

const chaveCarteira = (k: string): string => k.toLowerCase();

/** A mesma carteira em dois portefólios conta uma vez: tira-se o que as posições dela valiam. */
export function somarDefi(contas: ParcelasConta[]): number | undefined {
  let total: number | undefined;
  const vistas = new Set<string>();
  for (const c of contas) {
    const defi = num(c.defiUsd);
    if (defi === undefined) continue;
    const posicoes = c.defiPosicoes && typeof c.defiPosicoes === "object" ? Object.entries(c.defiPosicoes as Record<string, unknown>) : [];
    let repetido = 0;
    for (const [chave, lista] of posicoes) {
      const k = chaveCarteira(chave);
      if (vistas.has(k)) {
        for (const p of Array.isArray(lista) ? lista : []) repetido += num((p as { usd?: unknown } | null)?.usd) ?? 0;
      }
      vistas.add(k);
    }
    total = (total ?? 0) + Math.max(defi - repetido, 0);
  }
  return total;
}
