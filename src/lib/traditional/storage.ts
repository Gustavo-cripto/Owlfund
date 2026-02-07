export type TraditionalHolding = {
  buyValue?: number;
  buyDate?: string;
};

export type TraditionalHoldings = Record<string, TraditionalHolding>;

const STORAGE_KEY = "owlfund.traditional.holdings.v1";

export const loadTraditionalHoldings = (): TraditionalHoldings => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as TraditionalHoldings) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
};

export const saveTraditionalHoldings = (holdings: TraditionalHoldings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(holdings));
  } catch {
    // ignore
  }
};
