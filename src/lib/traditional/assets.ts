import type { TranslationKey } from "@/lib/i18n/translations";

export type TraditionalAsset = {
  id: string;
  label: string;
  category: string;
  alphaSymbol?: string;
  tvSymbol?: string;
};

export const traditionalCategories = ["Todos", "Ações", "ETFs", "Futuros", "Dívidas"];

// As categorias sao guardadas em portugues (e o que fica no ficheiro do
// utilizador e nos filtros); a traducao acontece so na apresentacao. Sem isto
// apareciam "Acoes" e "Dividas" em relatorios exportados em ingles.
const CATEGORY_KEY: Record<string, TranslationKey> = {
  "Todos": "tc_all",
  "Ações": "tc_stocks",
  "ETFs": "tc_etfs",
  "Futuros": "tc_futures",
  "Dívidas": "tc_bonds",
};

/** Nome da categoria no idioma atual. Categorias fora do catalogo ficam como estao. */
export function categoryLabel(category: string, t: (k: TranslationKey) => string): string {
  const key = CATEGORY_KEY[category];
  return key ? t(key) : category;
}

export const traditionalAssets: TraditionalAsset[] = [
  {
    id: "AAPL",
    label: "Apple (AAPL)",
    category: "Ações",
    alphaSymbol: "AAPL",
    tvSymbol: "NASDAQ:AAPL",
  },
  {
    id: "MSFT",
    label: "Microsoft (MSFT)",
    category: "Ações",
    alphaSymbol: "MSFT",
    tvSymbol: "NASDAQ:MSFT",
  },
  {
    id: "NVDA",
    label: "Nvidia (NVDA)",
    category: "Ações",
    alphaSymbol: "NVDA",
    tvSymbol: "NASDAQ:NVDA",
  },
  {
    id: "TSLA",
    label: "Tesla (TSLA)",
    category: "Ações",
    alphaSymbol: "TSLA",
    tvSymbol: "NASDAQ:TSLA",
  },
  {
    id: "SPY",
    label: "S&P 500 (SPY)",
    category: "ETFs",
    alphaSymbol: "SPY",
    tvSymbol: "AMEX:SPY",
  },
  {
    id: "QQQ",
    label: "Nasdaq 100 (QQQ)",
    category: "ETFs",
    alphaSymbol: "QQQ",
    tvSymbol: "NASDAQ:QQQ",
  },
  {
    id: "ARKK",
    label: "ARK Innovation (ARKK)",
    category: "ETFs",
    alphaSymbol: "ARKK",
    tvSymbol: "AMEX:ARKK",
  },
  {
    id: "GLD",
    label: "Ouro (GLD)",
    category: "ETFs",
    alphaSymbol: "GLD",
    tvSymbol: "AMEX:GLD",
  },
  {
    id: "SLV",
    label: "Prata (SLV)",
    category: "ETFs",
    alphaSymbol: "SLV",
    tvSymbol: "AMEX:SLV",
  },
  {
    id: "WTI",
    label: "Petróleo (WTI)",
    category: "Futuros",
    tvSymbol: "NYMEX:CL1!",
  },
  {
    id: "BRENT",
    label: "Petróleo (Brent)",
    category: "Futuros",
    tvSymbol: "ICEEUR:BRN1!",
  },
  {
    id: "NATGAS",
    label: "Gás natural",
    category: "Futuros",
    tvSymbol: "NYMEX:NG1!",
  },
  { id: "UST10Y", label: "Treasuries 10Y", category: "Dívidas", tvSymbol: "TVC:US10Y" },
  { id: "UST30Y", label: "Treasuries 30Y", category: "Dívidas", tvSymbol: "TVC:US30Y" },
];
