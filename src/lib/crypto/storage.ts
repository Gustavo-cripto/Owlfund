export type CryptoHolding = {
  buyValue?: number;
  buyDate?: string;
};

export type CryptoHoldings = Record<string, CryptoHolding>;

const STORAGE_KEY = "owlfund.crypto.holdings.v1";

export const loadCryptoHoldings = (): CryptoHoldings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as CryptoHoldings) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
};

export const saveCryptoHoldings = (holdings: CryptoHoldings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
  } catch {
    // ignore
  }
};
