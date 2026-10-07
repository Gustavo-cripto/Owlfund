// "Mercado agora" para o Block: preço e variação 24 h dos ativos que o
// utilizador detém (mais BTC/ETH/SOL), Fear & Greed e capitalização/dominância.
// Sem isto o Block sabia o que o utilizador tem mas não o que o mercado fez
// hoje, e não conseguia explicar "porque caiu". Nunca lança: devolve null.

import { precoOkx, precosOkx24h } from "@/lib/market/okxSpot";
import { getGlobalMarket } from "@/lib/api/market";

import { BASE_MERCADO as BASE, simbolosParaMercado } from "@/lib/ai/mercadoSimbolos";

const n = (v: number, dec = 2) => v.toLocaleString("pt-PT", { minimumFractionDigits: dec, maximumFractionDigits: dec });
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${n(Math.abs(v), 1)} %`;
const preco = (v: number) => (v >= 1000 ? n(v, 0) : v >= 1 ? n(v, 2) : n(v, 4));

async function fearGreed(): Promise<{ valor: number; rotulo: string } | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1&format=json", {
      headers: { Accept: "application/json" }, signal: AbortSignal.timeout(5000), next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: Array<{ value?: string; value_classification?: string }> };
    const d = j.data?.[0];
    const valor = Number(d?.value);
    return Number.isFinite(valor) ? { valor, rotulo: d?.value_classification ?? "" } : null;
  } catch { return null; }
}

/** Texto da secção (null se nenhuma fonte respondeu). */
export async function mercadoAgoraTexto(simbolosDoUtilizador: string[], opts: { nota?: string; eur?: boolean } = {}): Promise<string | null> {
  const simbolos = simbolosParaMercado(simbolosDoUtilizador);
  const [precos, fng, global, btcEur] = await Promise.all([
    precosOkx24h(Object.fromEntries(simbolos.map((s) => [s, s]))).catch(() => null),
    fearGreed(),
    getGlobalMarket().catch(() => null),
    opts.eur ? precoOkx("BTC-EUR") : Promise.resolve(null),
  ]);
  // EUR por USD a partir do par BTC-EUR da OKX (o site mostra preços em euros).
  const eurPorUsd = btcEur && precos?.BTC?.usd ? btcEur / precos.BTC.usd : null;
  const emEur = (usd: number) => (eurPorUsd ? ` ≈ € ${preco(usd * eurPorUsd)}` : "");
  const linhas: string[] = [];
  if (precos) {
    const lista = simbolos.filter((s) => precos[s]).map((s) => `${s} $${preco(precos[s].usd)}${emEur(precos[s].usd)} (${pct(precos[s].usd_24h_change)})`);
    if (lista.length) linhas.push(`Preços em USD${eurPorUsd ? " (e em euros, convertidos pelo par BTC-EUR)" : ""} e variação 24 h: ${lista.join(" · ")}`);
    const semPar = simbolos.filter((s) => !precos[s] && !BASE.includes(s));
    if (semPar.length) linhas.push(`Sem cotação na OKX (não comentar o preço): ${semPar.join(", ")}`);
  }
  if (fng) linhas.push(`Fear & Greed: ${fng.valor}/100${fng.rotulo ? ` (${fng.rotulo})` : ""}`);
  if (global && global.totalMarketCapUsd) {
    const cap = global.totalMarketCapUsd >= 1e12 ? `$${n(global.totalMarketCapUsd / 1e12, 2)} biliões` : `$${n(global.totalMarketCapUsd / 1e9, 0)} mil milhões`;
    linhas.push(`Capitalização total: ${cap}${global.marketCapChange24h != null ? ` (${pct(global.marketCapChange24h)} em 24 h)` : ""}${global.btcDominance != null ? ` · dominância BTC ${n(global.btcDominance, 1)} %` : ""}${global.ethDominance != null ? ` · ETH ${n(global.ethDominance, 1)} %` : ""}`);
  }
  if (!linhas.length) return null;
  linhas.push(opts.nota ?? "Para 'porque subiu/caiu hoje', cruza estas variações com o peso de cada ativo no portefólio. Não há notícias aqui: não inventes causas; se não souberes a causa, diz que o movimento é do mercado em geral ou do ativo, conforme os números.");
  return `=== MERCADO AGORA (lido neste momento) ===\n${linhas.join("\n")}`;
}
