import { accKey, allAccountIds, getActiveAccountId, isAllAccountsActive, readNamespaced } from "@/lib/portfolios/accounts";

// Histórico de movimentações nas Carteiras. Em vez de apanhar cada botão,
// guarda-se uma "fotografia" do que as Carteiras leram (carteiras, saldos,
// tokens, estáveis, exchanges, corretoras, registos manuais, DeFi, NFTs) e, na
// leitura seguinte, cada diferença vira um evento com data. Assim entra tanto
// o que a pessoa faz (adicionar uma carteira, ligar uma exchange) como o que
// muda sozinho (saldo, posição DeFi fechada, NFT recebido).
//
// Regra para não inventar movimentos: `null` quer dizer "não se conseguiu ler"
// e nunca se compara. Só há evento quando as duas leituras são conhecidas.

export type Saldos = Record<string, number>;

export type Foto = {
  carteiras: Record<string, { nome: string; simbolo: string; saldo: number | null }>;
  tokens: Record<string, { nome: string; saldos: Saldos | null }>;
  estaveis: Record<string, { nome: string; simbolo: string; saldo: number | null }>;
  exchanges: Record<string, { nome: string; saldos: Saldos | null }> | null;
  corretoras: Record<string, { nome: string; saldos: Saldos }>;
  /** Cripto manual, por carteira ("SIMBOLO|id"); `nome` = "ETH · Ledger". */
  manuais: Record<string, { nome?: string; qtd: number | null; investido: number | null }>;
  tradicionais: Record<string, { nome: string; qtd: number | null; investido: number | null }>;
  /** Por carteira: posições (chave → par/estado). null = DeFi ainda não lido. */
  defi: Record<string, { nome: string; posicoes: Record<string, { nome: string; estado: "aberta" | "fechada" }> | null }> | null;
  /** Por carteira: NFTs (ids, se a lista vier completa) e total. */
  nfts: Record<string, { nome: string; total: number | null; ids: Record<string, string> | null }> | null;
};

export type GrupoEvento = "carteira" | "exchange" | "defi" | "nft" | "manual";

export type Evento = {
  id: string;
  em: number;
  grupo: GrupoEvento;
  tipo:
    | "inicio"
    | "carteira_adicionada" | "carteira_removida" | "saldo"
    | "token_entrou" | "token_saiu" | "token_saldo"
    | "exchange_ligada" | "exchange_removida" | "exchange_ativo_entrou" | "exchange_ativo_saiu" | "exchange_saldo"
    | "manual_adicionado" | "manual_removido" | "manual_alterado"
    | "defi_aberta" | "defi_fechada" | "defi_removida"
    | "nft_entrou" | "nft_saiu";
  /** Onde: nome da carteira, exchange, corretora ou ativo. */
  alvo: string;
  simbolo?: string;
  antes?: number | null;
  depois?: number | null;
  /** NFTs ou posições: nomes (no máximo 5) e quantos. */
  nomes?: string[];
  quantos?: number;
};

const LIMITE_EVENTOS = 1500;
const CHAVE = "owlfund.wallet.history.v1";

// Variação mínima para contar: tokens com rebase (stETH…) mexem um pouco todos os dias.
const mudou = (a: number, b: number, relativo = 1e-6) => Math.abs(a - b) > Math.max(1e-12, relativo * Math.max(Math.abs(a), Math.abs(b)));

let seq = 0;
const novoId = (em: number) => `${em.toString(36)}-${(seq++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** As diferenças entre duas fotografias, como eventos (o mais antigo primeiro). */
export function diferencas(antes: Foto, depois: Foto, em: number): Evento[] {
  const ev: Evento[] = [];
  const add = (e: Omit<Evento, "id" | "em">) => ev.push({ id: novoId(em), em, ...e });

  // Carteiras e saldo da moeda nativa.
  for (const [k, d] of Object.entries(depois.carteiras)) {
    const a = antes.carteiras[k];
    if (!a) { add({ grupo: "carteira", tipo: "carteira_adicionada", alvo: d.nome, simbolo: d.simbolo, depois: d.saldo }); continue; }
    if (a.saldo != null && d.saldo != null && mudou(a.saldo, d.saldo)) add({ grupo: "carteira", tipo: "saldo", alvo: d.nome, simbolo: d.simbolo, antes: a.saldo, depois: d.saldo });
  }
  for (const [k, a] of Object.entries(antes.carteiras)) {
    if (!depois.carteiras[k]) add({ grupo: "carteira", tipo: "carteira_removida", alvo: a.nome, simbolo: a.simbolo, antes: a.saldo });
  }

  // Tokens das carteiras (frias): só com as duas listas lidas.
  for (const [k, d] of Object.entries(depois.tokens)) {
    const a = antes.tokens[k];
    if (!a || !a.saldos || !d.saldos) continue;
    compararSaldos(a.saldos, d.saldos, (s, x, y) => {
      if (x == null) add({ grupo: "carteira", tipo: "token_entrou", alvo: d.nome, simbolo: s, depois: y });
      else if (y == null) add({ grupo: "carteira", tipo: "token_saiu", alvo: d.nome, simbolo: s, antes: x });
      else add({ grupo: "carteira", tipo: "token_saldo", alvo: d.nome, simbolo: s, antes: x, depois: y });
    }, 5e-4);
  }

  // Estáveis por endereço.
  for (const [k, d] of Object.entries(depois.estaveis)) {
    const a = antes.estaveis[k];
    if (!a) { add({ grupo: "carteira", tipo: "carteira_adicionada", alvo: d.nome, simbolo: d.simbolo, depois: d.saldo }); continue; }
    if (a.saldo != null && d.saldo != null && mudou(a.saldo, d.saldo)) add({ grupo: "carteira", tipo: "saldo", alvo: d.nome, simbolo: d.simbolo, antes: a.saldo, depois: d.saldo });
  }
  for (const [k, a] of Object.entries(antes.estaveis)) {
    if (!depois.estaveis[k]) add({ grupo: "carteira", tipo: "carteira_removida", alvo: a.nome, simbolo: a.simbolo, antes: a.saldo });
  }

  // Exchanges (por API e Hyperliquid): só quando as duas leituras existem.
  if (antes.exchanges && depois.exchanges) {
    for (const [k, d] of Object.entries(depois.exchanges)) {
      const a = antes.exchanges[k];
      if (!a) { add({ grupo: "exchange", tipo: "exchange_ligada", alvo: d.nome }); continue; }
      if (a.saldos && d.saldos) compararExchange(a.saldos, d.saldos, d.nome, add);
    }
    for (const [k, a] of Object.entries(antes.exchanges)) {
      if (!depois.exchanges[k]) add({ grupo: "exchange", tipo: "exchange_removida", alvo: a.nome });
    }
  }
  // Corretoras registadas à mão (ou por CSV).
  for (const [k, d] of Object.entries(depois.corretoras)) {
    const a = antes.corretoras[k];
    if (!a) { add({ grupo: "exchange", tipo: "exchange_ligada", alvo: d.nome }); continue; }
    compararExchange(a.saldos, d.saldos, d.nome, add);
  }
  for (const [k, a] of Object.entries(antes.corretoras)) {
    if (!depois.corretoras[k]) add({ grupo: "exchange", tipo: "exchange_removida", alvo: a.nome });
  }

  // Registos manuais (cripto e tradicionais).
  const manuais = (av: Foto["manuais"], dv: Foto["manuais"], nome: (k: string) => string) => {
    for (const [k, d] of Object.entries(dv)) {
      const a = av[k];
      const sym = k.split("|")[0];
      if (!a) { add({ grupo: "manual", tipo: "manual_adicionado", alvo: nome(k), simbolo: sym, depois: d.qtd ?? d.investido }); continue; }
      const q = a.qtd != null && d.qtd != null && mudou(a.qtd, d.qtd);
      const i = a.investido != null && d.investido != null && mudou(a.investido, d.investido);
      if (q || i || (a.qtd == null) !== (d.qtd == null)) add({ grupo: "manual", tipo: "manual_alterado", alvo: nome(k), simbolo: sym, antes: a.qtd ?? a.investido, depois: d.qtd ?? d.investido });
    }
    for (const k of Object.keys(av)) if (!dv[k]) add({ grupo: "manual", tipo: "manual_removido", alvo: nome(k), simbolo: k.split("|")[0], antes: av[k].qtd ?? av[k].investido });
  };
  manuais(antes.manuais, depois.manuais, (k) => depois.manuais[k]?.nome ?? antes.manuais[k]?.nome ?? k);
  manuais(antes.tradicionais, depois.tradicionais, (k) => depois.tradicionais[k]?.nome ?? antes.tradicionais[k]?.nome ?? k);

  // DeFi: posições novas, fechadas ou desaparecidas (o valor muda com o preço e não conta).
  if (antes.defi && depois.defi) {
    for (const [carteira, d] of Object.entries(depois.defi)) {
      const a = antes.defi[carteira];
      if (!a?.posicoes || !d.posicoes) continue;
      for (const [k, p] of Object.entries(d.posicoes)) {
        const ap = a.posicoes[k];
        if (!ap) { if (p.estado === "aberta") add({ grupo: "defi", tipo: "defi_aberta", alvo: d.nome, nomes: [p.nome] }); continue; }
        if (ap.estado === "aberta" && p.estado === "fechada") add({ grupo: "defi", tipo: "defi_fechada", alvo: d.nome, nomes: [p.nome] });
        if (ap.estado === "fechada" && p.estado === "aberta") add({ grupo: "defi", tipo: "defi_aberta", alvo: d.nome, nomes: [p.nome] });
      }
      for (const [k, ap] of Object.entries(a.posicoes)) {
        if (!d.posicoes[k] && ap.estado === "aberta") add({ grupo: "defi", tipo: "defi_removida", alvo: d.nome, nomes: [ap.nome] });
      }
    }
  }

  // NFTs: por ids quando as duas listas vêm completas; senão, pela contagem.
  if (antes.nfts && depois.nfts) {
    for (const [carteira, d] of Object.entries(depois.nfts)) {
      const a = antes.nfts[carteira];
      if (!a || a.total == null || d.total == null) continue;
      if (a.ids && d.ids) {
        const entraram = Object.keys(d.ids).filter((id) => !(id in a.ids!));
        const sairam = Object.keys(a.ids).filter((id) => !(id in d.ids!));
        if (entraram.length) add({ grupo: "nft", tipo: "nft_entrou", alvo: d.nome, quantos: entraram.length, nomes: entraram.slice(0, 5).map((id) => d.ids![id]) });
        if (sairam.length) add({ grupo: "nft", tipo: "nft_saiu", alvo: d.nome, quantos: sairam.length, nomes: sairam.slice(0, 5).map((id) => a.ids![id]) });
      } else if (d.total > a.total) add({ grupo: "nft", tipo: "nft_entrou", alvo: d.nome, quantos: d.total - a.total });
      else if (d.total < a.total) add({ grupo: "nft", tipo: "nft_saiu", alvo: d.nome, quantos: a.total - d.total });
    }
  }
  return ev;
}

function compararSaldos(a: Saldos, d: Saldos, cb: (simbolo: string, antes: number | null, depois: number | null) => void, relativo = 1e-6) {
  for (const [s, y] of Object.entries(d)) {
    const x = a[s];
    if (x == null) { if (y > 0) cb(s, null, y); continue; }
    if (mudou(x, y, relativo)) cb(s, x, y);
  }
  for (const [s, x] of Object.entries(a)) if (!(s in d) && x > 0) cb(s, x, null);
}

function compararExchange(a: Saldos, d: Saldos, nome: string, add: (e: Omit<Evento, "id" | "em">) => void) {
  compararSaldos(a, d, (s, x, y) => {
    if (x == null) add({ grupo: "exchange", tipo: "exchange_ativo_entrou", alvo: nome, simbolo: s, depois: y });
    else if (y == null) add({ grupo: "exchange", tipo: "exchange_ativo_saiu", alvo: nome, simbolo: s, antes: x });
    else add({ grupo: "exchange", tipo: "exchange_saldo", alvo: nome, simbolo: s, antes: x, depois: y });
  });
}

/**
 * Junta o que ficou por ler à fotografia nova: uma carteira que hoje deu erro
 * fica com o que se sabia antes, para a leitura seguinte comparar com isso
 * (e não com "nada", que daria um movimento inventado).
 */
export function completarFoto(antes: Foto | null, depois: Foto): Foto {
  if (!antes) return depois;
  const mapa = <T extends object>(a: Record<string, T> | null, d: Record<string, T> | null, desconhecido: (x: T) => boolean): Record<string, T> | null => {
    if (!d) return a;
    if (!a) return d;
    const out: Record<string, T> = { ...d };
    for (const [k, x] of Object.entries(d)) if (desconhecido(x) && a[k]) out[k] = a[k];
    return out;
  };
  return {
    ...depois,
    carteiras: mapa(antes.carteiras, depois.carteiras, (x) => x.saldo == null)!,
    tokens: mapa(antes.tokens, depois.tokens, (x) => x.saldos == null)!,
    estaveis: mapa(antes.estaveis, depois.estaveis, (x) => x.saldo == null)!,
    exchanges: mapa(antes.exchanges, depois.exchanges, (x) => x.saldos == null),
    defi: mapa(antes.defi, depois.defi, (x) => x.posicoes == null),
    nfts: mapa(antes.nfts, depois.nfts, (x) => x.total == null),
  };
}

type Guardado = { foto: Foto | null; eventos: Evento[] };

/**
 * Fotografias antigas guardavam a cripto manual por símbolo ("ETH"); agora é
 * por carteira ("ETH|principal"). Sem isto, a 1.ª leitura depois da mudança
 * registava "ETH removido" e "ETH adicionado" que não aconteceram.
 */
export function migrarFoto(f: Foto | null): Foto | null {
  if (!f?.manuais) return f;
  const manuais: Foto["manuais"] = {};
  for (const [k, v] of Object.entries(f.manuais)) manuais[k.includes("|") ? k : `${k}|principal`] = v;
  return { ...f, manuais };
}

const ler = (raw: string | null): Guardado => {
  try {
    const j = raw ? (JSON.parse(raw) as Partial<Guardado>) : null;
    return { foto: j?.foto ?? null, eventos: Array.isArray(j?.eventos) ? j!.eventos : [] };
  } catch { return { foto: null, eventos: [] }; }
};

/** Regista a fotografia da conta ativa e devolve os eventos novos (nada na vista "Todas"). */
export function registarFoto(foto: Foto, em = Date.now()): Evento[] {
  if (typeof window === "undefined" || isAllAccountsActive()) return [];
  const chave = accKey(CHAVE);
  let g: Guardado;
  try { g = ler(window.localStorage.getItem(chave)); } catch { return []; }
  g.foto = migrarFoto(g.foto);
  const novos = g.foto ? diferencas(g.foto, foto, em) : [{ id: novoId(em), em, grupo: "carteira" as const, tipo: "inicio" as const, alvo: "" }];
  const proxima = completarFoto(g.foto, foto);
  const mesmaFoto = JSON.stringify(proxima) === JSON.stringify(g.foto);
  if (!novos.length && mesmaFoto) return [];
  const eventos = [...g.eventos, ...novos].slice(-LIMITE_EVENTOS);
  try { window.localStorage.setItem(chave, JSON.stringify({ foto: proxima, eventos })); } catch { /* armazenamento cheio */ }
  if (novos.length) window.dispatchEvent(new CustomEvent(EVENTO_HISTORICO));
  return novos;
}

export const EVENTO_HISTORICO = "cf-historico-carteiras";

/** Última fotografia completa da conta ativa (null na vista "Todas" ou sem leitura ainda). */
export function lerFoto(): Foto | null {
  if (typeof window === "undefined" || isAllAccountsActive()) return null;
  try { return migrarFoto(ler(window.localStorage.getItem(accKey(CHAVE))).foto); } catch { return null; }
}

/** Eventos da conta ativa (ou de todas, na vista "Todas"), do mais recente para o mais antigo. */
export function lerEventos(): Evento[] {
  if (typeof window === "undefined") return [];
  const ids = isAllAccountsActive() ? allAccountIds() : [getActiveAccountId()];
  const todos = ids.flatMap((id) => ler(readNamespaced(id, CHAVE)).eventos);
  return todos.sort((a, b) => b.em - a.em);
}
