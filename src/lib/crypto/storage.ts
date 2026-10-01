import { gravarSeMudou, accKey, allAccountIds, isAllAccountsActive, readNamespaced } from "@/lib/portfolios/accounts";

/** Uma carteira (ou corretora) onde está parte de um ativo registado à mão. */
export type CarteiraManual = {
  id: string;
  /** Nome escolhido pela pessoa (ex.: "Ledger", "Binance"). */
  nome?: string;
  quantity?: number;
  /** Valor investido em EUR. */
  buyValue?: number;
  buyDate?: string;
};

export type CryptoHolding = {
  /** Valor investido (custo) em EUR. Com `carteiras`, é a soma delas. */
  buyValue?: number;
  /** Com `carteiras`, a data mais antiga. */
  buyDate?: string;
  /** Quantidade de moedas detidas. Se preenchido, o valor atual passa a ser
   *  calculado por quantidade × preço de mercado (em vez do valor investido).
   *  Com `carteiras`, é a soma das quantidades delas. */
  quantity?: number;
  /**
   * O mesmo ativo em várias carteiras, cada uma com nome. Os totais de cima
   * mantêm-se sempre (é o que o Portefólio, o Painel e a IA leem).
   */
  carteiras?: CarteiraManual[];
};

export type CryptoHoldings = Record<string, CryptoHolding>;

/** As carteiras de um registo; um registo antigo (sem carteiras) é uma só, sem nome. */
export const linhasManuais = (h: CryptoHolding | undefined): CarteiraManual[] => {
  if (!h) return [];
  if (Array.isArray(h.carteiras) && h.carteiras.length) return h.carteiras;
  if (h.quantity == null && h.buyValue == null && !h.buyDate) return [];
  return [{ id: "principal", quantity: h.quantity, buyValue: h.buyValue, buyDate: h.buyDate }];
};

const positivo = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** Registo a partir das carteiras, com os totais recalculados. */
export const registoDeLinhas = (linhas: CarteiraManual[]): CryptoHolding => {
  // Arredondada a 12 casas: 0,1 + 0,05 dava 0,15000000000000002.
  const qtd = Math.round(linhas.reduce((s, l) => s + positivo(l.quantity), 0) * 1e12) / 1e12;
  const inv = linhas.reduce((s, l) => s + positivo(l.buyValue), 0);
  const datas = linhas.map((l) => l.buyDate).filter((d): d is string => !!d).sort();
  return {
    carteiras: linhas,
    ...(qtd > 0 ? { quantity: qtd } : {}),
    ...(inv > 0 ? { buyValue: inv } : {}),
    ...(datas.length ? { buyDate: datas[0] } : {}),
  };
};

/**
 * Valor de mercado atual (em EUR) de um registo manual.
 * Usa quantidade × preço quando ambos existem; caso contrário cai no valor investido.
 * Com várias carteiras, soma carteira a carteira (umas podem ter quantidade e
 * outras só o valor investido).
 */
export const cryptoHoldingValueEur = (
  holding: CryptoHolding,
  priceEur?: number
): number => {
  if (Array.isArray(holding.carteiras) && holding.carteiras.length) {
    return holding.carteiras.reduce((s, l) => s + cryptoHoldingValueEur({ quantity: l.quantity, buyValue: l.buyValue }, priceEur), 0);
  }
  const qty = Number(holding.quantity ?? 0);
  if (qty > 0 && priceEur && priceEur > 0) return qty * priceEur;
  const invested = Number(holding.buyValue ?? 0);
  return Number.isFinite(invested) ? invested : 0;
};

const cryptoHoldingsKey = () => accKey("owlfund.crypto.holdings.v1");

export const loadCryptoHoldings = (): CryptoHoldings => {
  try {
    // Vista combinada "Todas": soma quantidade e valor investido por símbolo.
    if (isAllAccountsActive()) {
      const merged: CryptoHoldings = {};
      for (const id of allAccountIds()) {
        const raw = readNamespaced(id, "owlfund.crypto.holdings.v1");
        if (!raw) continue;
        let obj: CryptoHoldings;
        try { obj = JSON.parse(raw) as CryptoHoldings; } catch { continue; }
        if (!obj || typeof obj !== "object") continue;
        for (const [sym, h] of Object.entries(obj)) {
          // As carteiras de cada conta juntam-se (ids prefixados pela conta).
          const linhas = linhasManuais(h).map((l) => ({ ...l, id: `${id}:${l.id}` }));
          merged[sym] = registoDeLinhas([...linhasManuais(merged[sym]), ...linhas]);
        }
      }
      return merged;
    }
    const raw = localStorage.getItem(cryptoHoldingsKey());
    const parsed = raw ? (JSON.parse(raw) as CryptoHoldings) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
};

export const saveCryptoHoldings = (holdings: CryptoHoldings) => {
  if (isAllAccountsActive()) return; // vista combinada é só leitura
  try {
    gravarSeMudou("owlfund.crypto.holdings.v1", JSON.stringify(holdings));
  } catch {
    // ignore
  }
};

/** Entrada de stablecoin por endereço (saldo lido por rede). balance é atualizado ao buscar. */
export type StablecoinEntry = {
  id: string;
  symbol: string;
  network: string;
  address: string;
  balance?: string;
};

const stablecoinKey = () => accKey("owlfund.stablecoin.addresses.v1");

export const loadStablecoinEntries = (): StablecoinEntry[] => {
  try {
    // Vista combinada "Todas": junta as stablecoins de todas as contas.
    if (isAllAccountsActive()) {
      const merged: StablecoinEntry[] = [];
      for (const id of allAccountIds()) {
        const raw = readNamespaced(id, "owlfund.stablecoin.addresses.v1");
        if (!raw) continue;
        try {
          const arr = JSON.parse(raw) as StablecoinEntry[];
          if (Array.isArray(arr)) merged.push(...arr);
        } catch { /* ignore */ }
      }
      return merged;
    }
    const raw = localStorage.getItem(stablecoinKey());
    const parsed = raw ? (JSON.parse(raw) as StablecoinEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveStablecoinEntries = (entries: StablecoinEntry[]) => {
  if (isAllAccountsActive()) return; // vista combinada é só leitura
  try {
    gravarSeMudou("owlfund.stablecoin.addresses.v1", JSON.stringify(entries));
  } catch {
    // ignore
  }
};
