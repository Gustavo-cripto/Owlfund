// Tipos partilhados entre src/app/(pt)/wallets/page.tsx e os componentes de
// src/components/wallets/ (extraidos da pagina na fase 1 da divisao).
import type { ReactNode } from "react";

export type TraditionalQuote = {
  symbol: string;
  price: number | null;
  /** Moeda do instrumento (USD, EUR, GBP...). Necessaria para converter
   *  quantidade x preco no total do portefolio. */
  currency?: string | null;
  changePercent: number | null;
  volume: number | null;
  updatedAt?: string;
};

export type MarketRow = {
  symbol: string;
  name: string;
  priceUsd: number;
  marketCapUsd?: number | null;
};

/** Campo de dinheiro da pagina (moneyField): o valor guardado e em EUR. */
export type MoneyFieldFn = (opts: { eur: number | undefined; onEur: (v: number | undefined) => void; placeholder: string; width: string; ariaLabel: string }) => ReactNode;
/** Campo de quantidade da pagina (qtyField). */
export type QtyFieldFn = (opts: { value: number | undefined; onValue: (v: number | undefined) => void; placeholder: string; title?: string; width: string; ariaLabel: string }) => ReactNode;
