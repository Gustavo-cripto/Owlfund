import { accKey, allAccountIds, isAllAccountsActive, readNamespaced } from "@/lib/portfolios/accounts";

export type CryptoHolding = {
  /** Valor investido (custo) em EUR. */
  buyValue?: number;
  buyDate?: string;
  /** Quantidade de moedas detidas. Se preenchido, o valor atual passa a ser
   *  calculado por quantidade × preço de mercado (em vez do valor investido). */
  quantity?: number;
};

export type CryptoHoldings = Record<string, CryptoHolding>;

/**
 * Valor de mercado atual (em EUR) de um registo manual.
 * Usa quantidade × preço quando ambos existem; caso contrário cai no valor investido.
 */
export const cryptoHoldingValueEur = (
  holding: CryptoHolding,
  priceEur?: number
): number => {
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
          const cur = merged[sym] ?? {};
          merged[sym] = {
            buyValue: (cur.buyValue ?? 0) + (h.buyValue ?? 0),
            quantity: (cur.quantity ?? 0) + (h.quantity ?? 0),
            buyDate: cur.buyDate ?? h.buyDate,
          };
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
    localStorage.setItem(cryptoHoldingsKey(), JSON.stringify(holdings));
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
    localStorage.setItem(stablecoinKey(), JSON.stringify(entries));
  } catch {
    // ignore
  }
};
