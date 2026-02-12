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

/** Entrada de stablecoin por endereço (saldo lido por rede). balance é atualizado ao buscar. */
export type StablecoinEntry = {
  id: string;
  symbol: string;
  network: string;
  address: string;
  balance?: string;
};

const STABLECOIN_STORAGE_KEY = "owlfund.stablecoin.addresses.v1";

export const loadStablecoinEntries = (): StablecoinEntry[] => {
  try {
    const raw = localStorage.getItem(STABLECOIN_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as StablecoinEntry[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveStablecoinEntries = (entries: StablecoinEntry[]) => {
  try {
    localStorage.setItem(STABLECOIN_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
};
