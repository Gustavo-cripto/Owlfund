import { accKey, allAccountIds, isAllAccountsActive, readNamespaced } from "@/lib/portfolios/accounts";

export type TraditionalHolding = {
  buyValue?: number;
  buyDate?: string;
};

export type TraditionalHoldings = Record<string, TraditionalHolding>;

const traditionalHoldingsKey = () => accKey("owlfund.traditional.holdings.v1");

export const loadTraditionalHoldings = (): TraditionalHoldings => {
  try {
    // Vista combinada "Todas": soma o valor investido por símbolo.
    if (isAllAccountsActive()) {
      const merged: TraditionalHoldings = {};
      for (const id of allAccountIds()) {
        const raw = readNamespaced(id, "owlfund.traditional.holdings.v1");
        if (!raw) continue;
        let obj: TraditionalHoldings;
        try { obj = JSON.parse(raw) as TraditionalHoldings; } catch { continue; }
        if (!obj || typeof obj !== "object") continue;
        for (const [sym, h] of Object.entries(obj)) {
          const cur = merged[sym] ?? {};
          merged[sym] = {
            buyValue: (cur.buyValue ?? 0) + (h.buyValue ?? 0),
            buyDate: cur.buyDate ?? h.buyDate,
          };
        }
      }
      return merged;
    }
    const raw = localStorage.getItem(traditionalHoldingsKey());
    const parsed = raw ? (JSON.parse(raw) as TraditionalHoldings) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
};

export const saveTraditionalHoldings = (holdings: TraditionalHoldings) => {
  if (isAllAccountsActive()) return; // vista combinada é só leitura
  try {
    localStorage.setItem(traditionalHoldingsKey(), JSON.stringify(holdings));
  } catch {
    // ignore
  }
};
