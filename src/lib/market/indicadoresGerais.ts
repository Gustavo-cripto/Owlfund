import { STABLE_EUR, STABLE_USD } from "@/lib/portfolio/history";

// Indicadores do mercado no geral, calculados com dados que a página do
// Mercado já tem (tabela do top 200 e histórico do medo e ganância).

type Linha = { symbol: string; marketCapUsd: number | null; change30d: number | null };

// Estáveis e "embrulhadas" (o mesmo ativo noutra rede ou em staking): não são
// altcoins para comparar com o BTC.
const ESTAVEIS_EXTRA = new Set(["USD1", "USDD", "USDY", "USDG", "RLUSD", "BUIDL", "USYC", "USTB", "FDUSD", "PYUSD", "GHO", "CRVUSD", "FRAX", "LUSD", "USDX", "EURC", "EURS"]);
const EMBRULHADAS = new Set(["WBTC", "CBBTC", "WETH", "STETH", "WSTETH", "WEETH", "RETH", "CBETH", "METH", "EZETH", "RSETH", "BTCB", "SOLVBTC", "LBTC", "TBTC", "JITOSOL", "MSOL", "BNSOL", "WBETH", "BETH", "STSOL", "CLBTC", "FBTC", "BBTC", "EBTC", "PUMPBTC", "UNIBTC"]);

export const eEstavel = (s: string) => STABLE_USD.has(s) || STABLE_EUR.has(s) || ESTAVEIS_EXTRA.has(s);

/** Capitalização das estáveis da tabela e a parte que são do total. */
export function capEstaveis(rows: readonly Linha[], totalCapUsd: number | null): { usd: number; parte: number | null } {
  const usd = rows.filter((r) => eEstavel(r.symbol) && r.marketCapUsd).reduce((s, r) => s + (r.marketCapUsd ?? 0), 0);
  return { usd, parte: totalCapUsd && totalCapUsd > 0 ? (usd / totalCapUsd) * 100 : null };
}

/**
 * Quantas das 50 maiores altcoins (sem estáveis nem embrulhadas) subiram mais
 * do que o BTC nos últimos 30 dias. O "índice da época das altcoins" mais
 * conhecido usa 90 dias; aqui são 30, e o ecrã di-lo.
 */
export function epocaAltcoins(rows: readonly Linha[]): { acima: number; total: number } | null {
  const btc = rows.find((r) => r.symbol === "BTC")?.change30d;
  if (btc == null) return null;
  const alts = [...rows]
    .filter((r) => r.symbol !== "BTC" && !eEstavel(r.symbol) && !EMBRULHADAS.has(r.symbol) && r.change30d != null)
    .sort((a, b) => (b.marketCapUsd ?? 0) - (a.marketCapUsd ?? 0))
    .slice(0, 50);
  if (alts.length < 10) return null;
  return { acima: alts.filter((r) => (r.change30d as number) > btc).length, total: alts.length };
}

type PontoFng = { value: number; classification: string; timestampSec: number };

const CLASSES: Record<string, "medo_extremo" | "medo" | "neutro" | "ganancia" | "ganancia_extrema"> = {
  "extreme fear": "medo_extremo", fear: "medo", neutral: "neutro", greed: "ganancia", "extreme greed": "ganancia_extrema",
};

/** Último valor do medo e ganância e a diferença para há 7 dias. */
export function resumoFng(pontos: readonly PontoFng[]) {
  if (!pontos.length) return null;
  const ord = [...pontos].sort((a, b) => b.timestampSec - a.timestampSec);
  const ult = ord[0];
  const alvo = ult.timestampSec - 7 * 86_400;
  const antes = ord.find((p) => p.timestampSec <= alvo + 3_600);
  const v = ult.value;
  const classe = CLASSES[ult.classification.trim().toLowerCase()]
    ?? (v <= 24 ? "medo_extremo" : v <= 44 ? "medo" : v <= 55 ? "neutro" : v <= 75 ? "ganancia" : "ganancia_extrema");
  return { valor: v, classe, var7: antes ? v - antes.value : null };
}
