// Saldos lidos da rede vs. saldos guardados (auditoria 28 set 2026).
//
// Defeito antigo: quando a leitura de um saldo falhava (429, 502, timeout, chave
// em falta), a página gravava "—" no mapa de saldos e os totais faziam
// `mapa[k] ?? guardado` — como "—" não é nullish, o saldo guardado nunca era
// usado e o total passava a 0. Uma falha de rede não pode apagar o que se sabe:
// mostra-se o aviso e mantém-se o último saldo conhecido.

export const SEM_SALDO = "—";

/** O valor é um saldo utilizável (número finito ≥ 0)? "—", vazio e lixo não são. */
export function temSaldo(v: unknown): v is string | number {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0;
  if (typeof v !== "string" || v.trim() === "" || v === SEM_SALDO) return false;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) && n >= 0;
}

/** Primeiro candidato utilizável, como número; 0 se nenhum servir. */
export function valorDoSaldo(...candidatos: unknown[]): number {
  for (const c of candidatos) {
    if (temSaldo(c)) return typeof c === "number" ? c : Number.parseFloat(c);
  }
  return 0;
}

/** Primeiro candidato utilizável tal como está (para mostrar); null se nenhum servir. */
export function primeiroSaldo(...candidatos: unknown[]): string | number | null {
  for (const c of candidatos) if (temSaldo(c)) return c;
  return null;
}

/**
 * Mapa de saldos depois de uma leitura FALHADA: se já havia um saldo bom para
 * a chave, fica como estava (devolve o mesmo objeto); só quando não havia nada
 * é que se marca "—".
 */
export function aposFalha(mapa: Record<string, string>, chave: string): Record<string, string> {
  return temSaldo(mapa[chave]) ? mapa : { ...mapa, [chave]: SEM_SALDO };
}

/** Leituras repetidas da mesma chave em poucos segundos (efeitos em cadeia) saltam-se. */
export const JANELA_LEITURA_MS = 20_000;
export function leituraRecente(ultimas: Map<string, number>, chave: string, agora: number, janela = JANELA_LEITURA_MS): boolean {
  const u = ultimas.get(chave);
  return u != null && agora - u < janela;
}
