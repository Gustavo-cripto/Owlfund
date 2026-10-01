import { ALL_ACCOUNTS_ID, allAccountIds, readNamespaced } from "@/lib/portfolios/accounts";
import { computeFifo, parseTrades, TRADE_HISTORY_KEY, type Trade } from "@/lib/portfolios/trades";
import { networkKey } from "@/lib/wallets/networkKey";
import { linhasManuais, type CryptoHolding } from "@/lib/crypto/storage";

// Ativos de uma conta (ou de todas), moeda a moeda, para a aba "O meu
// portefólio" do Mercado. Só leitura. Usa as mesmas fontes que o Portefólio:
// carteiras (moeda nativa), estáveis por endereço, cripto manual e corretoras
// registadas à mão. Saldos de exchanges por API, tokens das carteiras frias e
// DeFi só existem em totais (não há detalhe por moeda guardado).

export type FonteAtivo = "carteira" | "estavel" | "manual" | "exchange" | "exchangeApi" | "tokenFrio";

export type AtivoCripto = {
  symbol: string;
  /** Soma das quantidades conhecidas. */
  quantidade: number;
  /** Valor investido (EUR) de registos manuais sem quantidade. */
  investidoSemQuantidadeEur: number;
  fontes: FonteAtivo[];
  /**
   * Quantidade com custo conhecido e esse custo (EUR): registos manuais com
   * quantidade e valor investido, e compras ainda por vender no Histórico
   * (FIFO). Dá o custo médio; o ganho só se calcula para esta quantidade.
   */
  custoQtd: number;
  custoEur: number;
};

export type AtivoTradicional = { id: string; quantidade: number | null; investidoEur: number };

/** Carteira fria (Ledger/Trezor) cujos tokens se vão buscar à rede. */
export type CarteiraFria = { address: string; chain: "eth" | "sol"; redes: string[] };

export type AtivosConta = {
  cripto: AtivoCripto[];
  tradicional: AtivoTradicional[];
  /** Carteiras frias: os tokens delas só existem em total no Portefólio. */
  frias: CarteiraFria[];
  /** O Portefólio conta exchanges (por API ou à mão) nesta vista. */
  temExchanges: boolean;
};

/** Chave base → texto bruto do localStorage, de UMA conta. */
export type DadosConta = Partial<Record<string, string | null>>;

const NATIVAS: Record<string, string> = { eth: "ETH", sol: "SOL", btc: "BTC", ada: "ADA" };

const ler = <T,>(raw: string | null | undefined): T | null => {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
};
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const lista = (v: unknown): Array<Record<string, unknown>> =>
  Array.isArray(v) ? (v as Array<Record<string, unknown>>) : v && typeof v === "object" ? [v as Record<string, unknown>] : [];

/** Junta os ativos de várias contas. A mesma carteira em duas contas conta uma vez (como no Portefólio). */
export function juntarAtivos(contas: readonly DadosConta[]): AtivosConta {
  const cripto = new Map<string, AtivoCripto>();
  const somar = (symbol: string, qtd: number, fonte: FonteAtivo, semQtdEur = 0) => {
    const s = symbol.trim().toUpperCase();
    if (!s || (qtd <= 0 && semQtdEur <= 0)) return;
    const a = cripto.get(s) ?? { symbol: s, quantidade: 0, investidoSemQuantidadeEur: 0, fontes: [], custoQtd: 0, custoEur: 0 };
    a.quantidade += qtd;
    a.investidoSemQuantidadeEur += semQtdEur;
    if (!a.fontes.includes(fonte)) a.fontes.push(fonte);
    cripto.set(s, a);
  };
  const vistas = new Set<string>();
  const trad = new Map<string, AtivoTradicional>();
  const custos = new Map<string, { q: number; c: number }>();
  const juntarCusto = (simbolo: string, q: number, c: number) => {
    if (!(q > 0 && c > 0)) return;
    const k = simbolo.trim().toUpperCase();
    const x = custos.get(k) ?? { q: 0, c: 0 };
    x.q += q; x.c += c;
    custos.set(k, x);
  };
  const historico: Trade[] = [];
  const redesPorEndereco = new Map<string, Set<string>>();
  const frias = new Map<string, Omit<CarteiraFria, "redes">>();
  let temExchanges = false;

  for (const c of contas) {
    const snap = ler<Record<string, unknown>>(c["portfolio-wallets"]) ?? {};
    if (typeof snap.cexUsd === "number" && snap.cexUsd > 0) temExchanges = true;
    for (const [rede, chain] of [["eth", "eth"], ["sol", "sol"]] as const) {
      for (const e of lista(snap[rede])) {
        if (typeof e.address !== "string" || !e.address) continue;
        const k = `${chain}:${e.address}`;
        // O nativo das redes registadas já conta na carteira (não duplicar).
        const redes = redesPorEndereco.get(k) ?? new Set<string>();
        redes.add(networkKey(String(e.network ?? (chain === "eth" ? "Ethereum" : "Solana"))));
        redesPorEndereco.set(k, redes);
        if (e.source === "cold") frias.set(k, { address: e.address, chain });
      }
    }
    for (const [rede, simbolo] of Object.entries(NATIVAS)) {
      for (const e of lista(snap[rede])) {
        const endereco = typeof e.address === "string" ? e.address.toLowerCase() : "";
        const chave = `${endereco}:${String(e.network ?? rede)}`;
        if (endereco && vistas.has(chave)) continue;
        if (endereco) vistas.add(chave);
        somar(simbolo, num(e.balance), "carteira");
      }
    }
    for (const e of lista(ler(c["owlfund.stablecoin.addresses.v1"]))) {
      const chave = `est:${String(e.address ?? "").toLowerCase()}:${String(e.network ?? "")}:${String(e.symbol ?? "")}`;
      if (e.address && vistas.has(chave)) continue;
      if (e.address) vistas.add(chave);
      if (typeof e.symbol === "string") somar(e.symbol, num(e.balance), "estavel");
    }
    const manuais = ler<Record<string, CryptoHolding>>(c["owlfund.crypto.holdings.v1"]) ?? {};
    for (const [simbolo, h] of Object.entries(manuais)) {
      // Carteira a carteira: umas podem ter quantidade e outras só o investido.
      for (const l of linhasManuais(h)) {
        const q = num(l.quantity);
        somar(simbolo, q, "manual", q > 0 ? 0 : num(l.buyValue));
        juntarCusto(simbolo, q, num(l.buyValue));
      }
    }
    historico.push(...parseTrades(c[TRADE_HISTORY_KEY] ?? null).filter((t) => !t.deleted));
    for (const v of lista(ler(c["owlfund.venue.holdings.v1"]))) {
      for (const a of lista(v.assets)) if (typeof a.asset === "string") somar(a.asset, num(a.qty), "exchange");
    }
    const tradicionais = ler<Record<string, { quantity?: unknown; buyValue?: unknown }>>(c["owlfund.traditional.holdings.v1"]) ?? {};
    for (const [id, h] of Object.entries(tradicionais)) {
      const t = trad.get(id) ?? { id, quantidade: null, investidoEur: 0 };
      const q = num(h?.quantity);
      if (q > 0) t.quantidade = (t.quantidade ?? 0) + q;
      t.investidoEur += num(h?.buyValue);
      trad.set(id, t);
    }
  }
  // Histórico: o custo das compras ainda por vender (todas as contas juntas).
  if (historico.length) {
    for (const [simbolo, b] of Object.entries(computeFifo(historico).byAsset)) juntarCusto(simbolo, b.qtyNet, b.costOpen);
  }
  for (const [k, x] of custos) {
    const a = cripto.get(k);
    if (a) { a.custoQtd = x.q; a.custoEur = x.c; }
  }
  return { cripto: [...cripto.values()], tradicional: [...trad.values()],
    frias: [...frias.entries()].map(([k, f]) => ({ ...f, redes: [...(redesPorEndereco.get(k) ?? [])] })), temExchanges };
}

const BASES = ["portfolio-wallets", "owlfund.stablecoin.addresses.v1", "owlfund.crypto.holdings.v1", "owlfund.venue.holdings.v1", "owlfund.traditional.holdings.v1", TRADE_HISTORY_KEY];

/** Lê do navegador os ativos de uma conta, ou de todas com ALL_ACCOUNTS_ID. */
export function lerAtivosConta(contaId: string): AtivosConta {
  const ids = contaId === ALL_ACCOUNTS_ID ? allAccountIds() : [contaId];
  return juntarAtivos(ids.map((id) => {
    const d: DadosConta = Object.fromEntries(BASES.map((b) => [b, readNamespaced(id, b)]));
    // Histórico de antes das contas (chave sem prefixo), como em loadTrades.
    if (d[TRADE_HISTORY_KEY] == null && ids.length === 1) {
      try { d[TRADE_HISTORY_KEY] = window.localStorage.getItem(TRADE_HISTORY_KEY); } catch { /* modo privado */ }
    }
    return d;
  }));
}

/** Custo médio (EUR por unidade) e ganho por realizar de um ativo a um preço (EUR). */
export function ganhoAtivo(a: Pick<AtivoCripto, "quantidade" | "custoQtd" | "custoEur">, precoEur: number | null) {
  if (!(a.custoQtd > 0) || !(a.custoEur > 0) || precoEur == null) return null;
  const medio = a.custoEur / a.custoQtd;
  const coberta = Math.min(a.quantidade, a.custoQtd);
  if (!(coberta > 0)) return null;
  return { medio, ganhoEur: coberta * (precoEur - medio), pct: (precoEur / medio - 1) * 100, parcial: coberta < a.quantidade * 0.999 };
}

/** Junta saldos lidos em direto (exchanges por API, tokens frios) à lista guardada. */
export function juntarVivos(cripto: readonly AtivoCripto[], saldos: ReadonlyArray<{ symbol: string; quantidade: number }>, fonte: FonteAtivo): AtivoCripto[] {
  const m = new Map(cripto.map((a) => [a.symbol, { ...a, fontes: [...a.fontes] }]));
  for (const v of saldos) {
    const k = v.symbol.trim().toUpperCase();
    if (!k || !(v.quantidade > 0)) continue;
    const a = m.get(k) ?? { symbol: k, quantidade: 0, investidoSemQuantidadeEur: 0, fontes: [], custoQtd: 0, custoEur: 0 };
    a.quantidade += v.quantidade;
    if (!a.fontes.includes(fonte)) a.fontes.push(fonte);
    m.set(k, a);
  }
  return [...m.values()];
}
