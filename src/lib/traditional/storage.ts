import { accKey, allAccountIds, isAllAccountsActive, readNamespaced } from "@/lib/portfolios/accounts";

export type TraditionalHolding = {
  /** Valor investido (custo) em EUR. */
  buyValue?: number;
  buyDate?: string;
  /** Numero de acoes/unidades. Se preenchido, o valor passa a ser calculado a
   *  preco de mercado — como ja acontecia na cripto. Sem isto, o portefolio
   *  tradicional so sabia dizer quanto se investiu, nunca quanto vale hoje. */
  quantity?: number;
};

/**
 * Valor de mercado atual (em EUR) de um ativo tradicional.
 * Usa quantidade x preco quando ha ambos; caso contrario cai no valor investido
 * — que e o que existia antes e continua a ser a verdade para quem so registou
 * o montante.
 */
export const traditionalHoldingValueEur = (
  holding: TraditionalHolding,
  priceEur?: number,
): number => {
  const qty = Number(holding.quantity ?? 0);
  if (qty > 0 && priceEur && priceEur > 0) return qty * priceEur;
  const invested = Number(holding.buyValue ?? 0);
  return Number.isFinite(invested) ? invested : 0;
};

/** True quando o ativo tem quantidade — ou seja, quando o valor e de mercado. */
export const hasQuantity = (holding: TraditionalHolding | undefined): boolean =>
  Number(holding?.quantity ?? 0) > 0;

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
            quantity: (cur.quantity ?? 0) + (h.quantity ?? 0),
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
