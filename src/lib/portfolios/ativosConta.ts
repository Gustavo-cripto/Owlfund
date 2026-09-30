import { ALL_ACCOUNTS_ID, allAccountIds, readNamespaced } from "@/lib/portfolios/accounts";

// Ativos de uma conta (ou de todas), moeda a moeda, para a aba "O meu
// portefólio" do Mercado. Só leitura. Usa as mesmas fontes que o Portefólio:
// carteiras (moeda nativa), estáveis por endereço, cripto manual e corretoras
// registadas à mão. Saldos de exchanges por API, tokens das carteiras frias e
// DeFi só existem em totais (não há detalhe por moeda guardado).

export type FonteAtivo = "carteira" | "estavel" | "manual" | "exchange";

export type AtivoCripto = {
  symbol: string;
  /** Soma das quantidades conhecidas. */
  quantidade: number;
  /** Valor investido (EUR) de registos manuais sem quantidade. */
  investidoSemQuantidadeEur: number;
  fontes: FonteAtivo[];
};

export type AtivoTradicional = { id: string; quantidade: number | null; investidoEur: number };

export type AtivosConta = { cripto: AtivoCripto[]; tradicional: AtivoTradicional[] };

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
    const a = cripto.get(s) ?? { symbol: s, quantidade: 0, investidoSemQuantidadeEur: 0, fontes: [] };
    a.quantidade += qtd;
    a.investidoSemQuantidadeEur += semQtdEur;
    if (!a.fontes.includes(fonte)) a.fontes.push(fonte);
    cripto.set(s, a);
  };
  const vistas = new Set<string>();
  const trad = new Map<string, AtivoTradicional>();

  for (const c of contas) {
    const snap = ler<Record<string, unknown>>(c["portfolio-wallets"]) ?? {};
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
    const manuais = ler<Record<string, { quantity?: unknown; buyValue?: unknown }>>(c["owlfund.crypto.holdings.v1"]) ?? {};
    for (const [simbolo, h] of Object.entries(manuais)) {
      const q = num(h?.quantity);
      somar(simbolo, q, "manual", q > 0 ? 0 : num(h?.buyValue));
    }
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
  return { cripto: [...cripto.values()], tradicional: [...trad.values()] };
}

const BASES = ["portfolio-wallets", "owlfund.stablecoin.addresses.v1", "owlfund.crypto.holdings.v1", "owlfund.venue.holdings.v1", "owlfund.traditional.holdings.v1"];

/** Lê do navegador os ativos de uma conta, ou de todas com ALL_ACCOUNTS_ID. */
export function lerAtivosConta(contaId: string): AtivosConta {
  const ids = contaId === ALL_ACCOUNTS_ID ? allAccountIds() : [contaId];
  return juntarAtivos(ids.map((id) => Object.fromEntries(BASES.map((b) => [b, readNamespaced(id, b)]))));
}
