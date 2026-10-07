// Lista de símbolos a consultar no "mercado agora" (puro, testado em
// scripts/testes/mercadoAgora.test.ts; o fetch vive em mercadoAgora.ts).

export const BASE_MERCADO = ["BTC", "ETH", "SOL"];
const ESTAVEIS = new Set(["USDT", "USDC", "DAI", "USD", "EUR", "EURC", "USDE", "FDUSD", "TUSD", "PYUSD"]);
const MAX_SIMBOLOS = 15;

/** Símbolos a consultar: base + os do utilizador, sem estáveis, sem repetidos, com limite. */
export function simbolosParaMercado(doUtilizador: string[]): string[] {
  const out: string[] = [];
  for (const s of [...BASE_MERCADO, ...doUtilizador]) {
    const sym = String(s ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!sym || sym.length > 10 || ESTAVEIS.has(sym) || out.includes(sym)) continue;
    out.push(sym);
    if (out.length >= MAX_SIMBOLOS) break;
  }
  return out;
}


// Nomes comuns → símbolo, para "quanto está o bitcoin?" (minúsculas, sem acentos).
const NOMES: Record<string, string> = {
  bitcoin: "BTC", btc: "BTC", ethereum: "ETH", ether: "ETH", eth: "ETH", solana: "SOL", sol: "SOL",
  cardano: "ADA", ripple: "XRP", xrp: "XRP", dogecoin: "DOGE", doge: "DOGE", binance: "BNB", bnb: "BNB",
  tron: "TRX", chainlink: "LINK", avalanche: "AVAX", polkadot: "DOT", litecoin: "LTC", toncoin: "TON",
  polygon: "POL", shiba: "SHIB", pepe: "PEPE", uniswap: "UNI", aave: "AAVE", sui: "SUI", aptos: "APT",
  arbitrum: "ARB", optimism: "OP", near: "NEAR", cosmos: "ATOM", stellar: "XLM", monero: "XMR", hyperliquid: "HYPE",
};
// Siglas em maiúsculas que não são moedas (evita pedir cotação de "ETF" ou "PNL").
const NAO_MOEDA = new Set(["ETF", "ETFS", "PNL", "ROI", "CAGR", "FIRE", "API", "MCP", "CSV", "PDF", "IRS", "EUR", "USD", "UE", "EUA", "CEX", "DEX", "NFT", "NFTS", "DEFI", "FIFO", "LIFO", "RSI", "MACD", "ATH", "KYC", "MICA", "IA", "AI", "OK", "PT", "ES", "FR", "EN", "VAR", "TVL", "APY", "APR", "GAS"]);

/** Símbolos de cripto citados num texto (por nome ou sigla em maiúsculas), por ordem, sem repetidos. */
export function simbolosDaPergunta(texto: string): string[] {
  const out: string[] = [];
  const add = (s: string) => { if (!out.includes(s)) out.push(s); };
  const baixo = String(texto ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  for (const palavra of baixo.match(/[a-z0-9]+/g) ?? []) if (NOMES[palavra]) add(NOMES[palavra]);
  for (const sigla of String(texto ?? "").match(/\b[A-Z][A-Z0-9]{1,5}\b/g) ?? []) if (!NAO_MOEDA.has(sigla)) add(sigla);
  return out.slice(0, 10);
}

/** Majors que o Chain lê sempre, além dos citados (BTC/ETH/SOL já vêm da base). */
export const MAJORS_CHAIN = ["XRP", "BNB", "ADA", "DOGE", "TRX", "LINK", "AVAX"];
