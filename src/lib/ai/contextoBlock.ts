// Contexto do SERVIDOR para o Block (Gestor Dedicado IA): o que o browser não
// tem ou não deve calcular — histórico das fotografias com variações e
// métricas, pontuação gravada, estimativa fiscal do país do idioma, lista de
// países suportados e baleias conhecidas. Cada bloco falha sozinho: o Block
// responde com o que houver.

import { historicoParaIa } from "@/lib/ai/historicoPortefolio";
import { getScore, getTaxEstimate, listTaxCountries } from "@/lib/api/insights";
import { getKnownWhales } from "@/lib/api/known-whales";
import { COUNTRIES } from "@/lib/tax/countries";
import { mercadoAgoraTexto } from "@/lib/ai/mercadoAgora";

// Sem país fiscal guardado no perfil, assume-se o do idioma (e diz-se à IA que é
// uma suposição). Em inglês não se assume nada: GB, US, IE, AU… são diferentes.
const PAIS_DO_IDIOMA: Record<string, string> = { pt: "PT", es: "ES", fr: "FR" };

const eur = (v: number | null | undefined) => (v == null ? "—" : `€ ${v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

async function pontuacao(userId: string, accountId: string): Promise<string> {
  const s = await getScore(userId, accountId);
  if (s.score == null) return `=== PONTUAÇÃO DO PORTEFÓLIO ===\n${s.note}`;
  return [
    "=== PONTUAÇÃO DO PORTEFÓLIO (0–100, a mesma do ecrã) ===",
    `Pontuação: ${s.score}/100 (gravada em ${s.asOf ? new Date(s.asOf).toLocaleDateString("pt-PT") : "?"}).`,
    "Partes: " + s.parts.map((p) => `${p.label} ${p.points}/${p.max}`).join(" · "),
    "Diversificação 30, mistura cripto/tradicional 20, reserva estável 10, desempenho 20, risco 20. É apoio à leitura, não recomendação.",
  ].join("\n");
}

async function fiscal(userId: string, lang: string, paisPerfil?: string): Promise<string> {
  const paises = listTaxCountries();
  const lista = "Países com regras publicadas (código: curto/longo, dias para longo): " +
    paises.countries.map((c) => `${c.code}: ${Math.round(c.shortTermRate * 100)} %/${Math.round(c.longTermRate * 100)} %${c.longTermAfterDays ? ` após ${c.longTermAfterDays} d` : ""}`).join(" · ");
  // País do perfil do utilizador (memória do Block) primeiro; só sem ele se assume pelo idioma.
  const doPerfil = paisPerfil && COUNTRIES.some((c) => c.code === paisPerfil) ? paisPerfil : null;
  const pais = doPerfil ?? PAIS_DO_IDIOMA[lang];
  if (!pais) {
    return `=== FISCALIDADE ===\n${lista}\nPara uma estimativa de imposto, pergunta ao utilizador em que país declara (ou manda-o a /fiscalidade, onde escolhe o país e exporta o relatório).`;
  }
  const ano = new Date().getFullYear();
  const est = await getTaxEstimate(userId, pais, ano);
  if ("error" in est) return `=== FISCALIDADE ===\n${lista}`;
  const linhas = [
    `=== FISCALIDADE — estimativa ${ano} para ${pais} (${doPerfil ? "país indicado pelo utilizador no perfil" : "país ASSUMIDO pelo idioma; se o utilizador declarar noutro país, di-lo e manda-o a /fiscalidade ou ao perfil do Block"}) ===`,
    `Vendas no ano: ${est.sales} · mais-valias brutas ${eur(est.totalGain)} · tributável ${eur(est.taxableGain)} · isento ${eur(est.exemptGain)} · menos-valias ${eur(est.losses)} (compensadas ${eur(est.lossesOffset)}) · taxas deduzidas ${eur(est.feesDeducted)}.`,
    `Imposto estimado: ${est.estimatedTax == null ? "não calculável (faltam câmbios ou dados)" : eur(est.estimatedTax)}${est.estimatedTaxRange ? ` (intervalo ${eur(est.estimatedTaxRange.min)}–${eur(est.estimatedTaxRange.max)})` : ""}.`,
    `Taxas: curto ${Math.round(est.rates.short * 100)} %, longo ${Math.round(est.rates.long * 100)} %${est.rates.longTermAfterDays ? ` após ${est.rates.longTermAfterDays} dias de detenção` : ""}.`,
    ...("warning" in est && est.warning ? [`AVISO: ${est.warning}`] : []),
    "As transações usadas são as de TODAS as contas do utilizador. É uma estimativa — recomenda sempre validar com contabilista.",
    lista,
  ];
  return linhas.join("\n");
}

function baleias(): string {
  const w = getKnownWhales();
  const porRede = (chain: string) => w.filter((x) => x.chain === chain).map((x) => x.label).join(", ");
  return [
    `=== BALEIAS CONHECIDAS (pré-carregadas em /smart-money, ${w.length}; o utilizador pode segui-las na watchlist) ===`,
    `Ethereum: ${porRede("eth")}`, `Solana: ${porRede("sol")}`, `Bitcoin: ${porRede("btc")}`,
    "Os movimentos recentes das carteiras que o utilizador segue chegam-te na secção da watchlist (quando houver).",
  ].join("\n");
}

export async function contextoBlockServidor(opts: {
  userId: string; accountId: string; totalAtual: number | null; locale: string; lang: string;
  /** Temas da pergunta (orcamentoBlock.temasDaPergunta): fiscalidade e baleias só entram a pedido. */
  temas: Set<string>;
  /** País fiscal guardado no perfil do Block (código ISO), se houver. */
  paisFiscal?: string;
  /** Símbolos que o utilizador detém (para o "mercado agora"). */
  simbolos?: string[];
}): Promise<string> {
  const [hist, score, fisc, mercado] = await Promise.allSettled([
    historicoParaIa({ userId: opts.userId, plan: "premium", accountId: opts.accountId, totalAtual: opts.totalAtual, locale: opts.locale }),
    pontuacao(opts.userId, opts.accountId),
    opts.temas.has("fiscal") ? fiscal(opts.userId, opts.lang, opts.paisFiscal) : Promise.resolve(null),
    mercadoAgoraTexto(opts.simbolos ?? []),
  ]);
  const partes = [
    mercado.status === "fulfilled" ? mercado.value : null,
    hist.status === "fulfilled" ? hist.value : null,
    score.status === "fulfilled" ? score.value : null,
    fisc.status === "fulfilled" ? fisc.value : null,
    opts.temas.has("baleias") ? baleias() : null,
  ].filter((p): p is string => Boolean(p));
  for (const r of [hist, score, fisc, mercado]) if (r.status === "rejected") console.error("[gestor] contexto parcial:", r.reason instanceof Error ? r.reason.message : r.reason);
  return partes.join("\n\n");
}
