// Portefólios duplicados ("Conta 1" a mais) — auditoria 28–29 set 2026.
//
// Cada browser/aparelho novo criava a sua "Conta 1" antes de a nuvem responder
// e ficava nela; a pessoa via tudo vazio e voltava a juntar as MESMAS carteiras.
// Na base havia contas com 4, 7 e 11 portefólios, quase todos "Conta 1" com as
// mesmas carteiras — a vista "Todas" somava-as várias vezes.
//
// Regra (conservadora, sem perda de dados por construção):
// só uma conta chamada "Conta 1" (o nome automático) pode ser removida, e só
// quando TUDO o que ela tem — carteiras, ativos manuais, stablecoins, trades,
// locais — já existe noutra "Conta 1" que fica. Contas com nome dado pela
// pessoa, ou com alguma coisa que mais nenhuma tem, nunca saem.
// Funções puras; testes em scripts/testes/contasDuplicadas.test.ts.

export const NOME_AUTOMATICO = "Conta 1";

const CARTEIRAS = "portfolio-wallets";
const TRADES = "trade-history-v1";

/** "Quem é" cada coisa guardada numa chave, como conjunto de identidades comparáveis. */
export function identidades(base: string, raw: string | null | undefined): Set<string> {
  const out = new Set<string>();
  if (raw == null || raw.trim() === "") return out;
  let v: unknown;
  try { v = JSON.parse(raw); } catch { out.add(`?:${raw}`); return out; }   // ilegível: só igual a si próprio
  if (v == null) return out;

  if (base === CARTEIRAS && typeof v === "object" && !Array.isArray(v)) {
    const s = v as Record<string, unknown>;
    for (const rede of ["eth", "sol", "btc", "ada", "other"]) {
      const lista = Array.isArray(s[rede]) ? (s[rede] as Array<Record<string, unknown>>) : s[rede] && typeof s[rede] === "object" ? [s[rede] as Record<string, unknown>] : [];
      for (const w of lista) {
        const end = typeof w?.address === "string" ? w.address.trim() : "";
        if (!end) continue;
        // EVM não distingue maiúsculas; os outros endereços sim.
        const e = rede === "eth" ? end.toLowerCase() : end;
        out.add(`${rede}:${String(w.network ?? "")}:${e}`);
      }
    }
    return out;   // os totais (cexUsd, defiUsd…) são recalculados pelas páginas
  }

  if (base === TRADES && Array.isArray(v)) {
    for (const t of v as Array<Record<string, unknown>>) {
      if (t && t.deleted !== true && t.id != null) out.add(`t:${String(t.id)}`);
    }
    return out;
  }

  if (Array.isArray(v)) {
    for (const x of v) out.add(`a:${JSON.stringify(x)}`);
    return out;
  }
  if (typeof v === "object") {
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (x == null) continue;
      if (typeof x === "number" && x === 0) continue;
      if (typeof x === "object" && Object.keys(x as object).length === 0) continue;
      out.add(`o:${k}:${JSON.stringify(x)}`);
    }
    return out;
  }
  if (typeof v === "number" ? v !== 0 : String(v).trim() !== "") out.add(`v:${JSON.stringify(v)}`);
  return out;
}

export type Conteudo = Record<string, Set<string>>;   // base -> identidades

const tamanho = (c: Conteudo) => Object.values(c).reduce((n, s) => n + s.size, 0);

/** `k` tem tudo o que `x` tem? */
export function cobre(k: Conteudo, x: Conteudo): boolean {
  for (const [base, doX] of Object.entries(x)) {
    const doK = k[base];
    for (const i of doX) if (!doK || !doK.has(i)) return false;
  }
  return true;
}

export type ContaParaDedupe = {
  id: string;
  name: string;
  /** Conta ativa (local ou, na falta, a da nuvem): em empate é a que fica. */
  ativa: boolean;
  /** Já existe na nuvem: entre iguais fica a da nuvem, para todos os aparelhos
   *  acabarem com o MESMO id (senão cada um ficava com o seu e andavam a trocar). */
  naNuvem: boolean;
  /** Tudo o que a conta PODE ter (união do local com a nuvem): o que tem de estar coberto. */
  possivel: Conteudo;
  /** O que a conta vai ter DEPOIS do merge: aquilo com que pode cobrir outras. */
  final: Conteudo;
};

/**
 * Ids das contas a remover. Só entram contas com o nome automático; cada uma
 * sai se outra conta com o nome automático, que fica, cobrir tudo o que ela
 * tem. Se todas forem equivalentes fica uma: a maior, depois a que já está na
 * nuvem, depois a ativa, depois a primeira da lista.
 */
export function contasRedundantes(contas: ContaParaDedupe[]): string[] {
  const familia = contas.filter((c) => c.name === NOME_AUTOMATICO);
  if (familia.length < 2) {
    // Uma só "Conta 1": só sai se estiver vazia e houver mais contas.
    const so = familia[0];
    return so && tamanho(so.possivel) === 0 && contas.length > 1 ? [so.id] : [];
  }
  const ordem = new Map(contas.map((c, i) => [c.id, i]));
  // Das mais pequenas para as maiores; em empate saem primeiro as que só
  // existem neste aparelho, depois as NÃO ativas, depois as últimas da lista —
  // assim, entre iguais, fica a da nuvem / a ativa / a primeira.
  const candidatas = [...familia].sort((a, b) =>
    tamanho(a.possivel) - tamanho(b.possivel)
    || Number(a.naNuvem) - Number(b.naNuvem)
    || Number(a.ativa) - Number(b.ativa)
    || (ordem.get(b.id)! - ordem.get(a.id)!));
  const fora = new Set<string>();
  for (const x of candidatas) {
    const guardia = familia.find((k) => k.id !== x.id && !fora.has(k.id) && cobre(k.final, x.possivel));
    if (guardia) fora.add(x.id);
  }
  // Conta 1 vazias que sobraram (não havia outra Conta 1 para as cobrir — p. ex.
  // a família era só vazias e ficou uma): se há contas com nome próprio, saem.
  const restoFamilia = familia.filter((c) => !fora.has(c.id));
  const outras = contas.filter((c) => c.name !== NOME_AUTOMATICO);
  if (outras.length > 0) for (const c of restoFamilia) if (tamanho(c.possivel) === 0) fora.add(c.id);
  return [...fora];
}
