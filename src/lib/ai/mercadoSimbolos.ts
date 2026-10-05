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

