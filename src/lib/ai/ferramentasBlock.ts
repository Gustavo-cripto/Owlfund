// Ferramentas (function calling) do Block: em vez de receber TUDO no prompt,
// o modelo pode pedir uma secção inteira dos dados do utilizador, preços de
// moedas que ele não detém, ou a estimativa fiscal de um país. O orçamento
// continua a escolher o que vai à partida (orcamentoBlock.ts); as ferramentas
// cobrem o que ficou de fora ou resumido.

import type { ToolDef } from "@/lib/ai/groq";
import { catalogoSeccoes, type Seccao } from "@/lib/ai/orcamentoBlock";
import { precosOkx24h } from "@/lib/market/okxSpot";
import { getTaxEstimate } from "@/lib/api/insights";
import { COUNTRIES } from "@/lib/tax/countries";
import { simbolosParaMercado } from "@/lib/ai/mercadoSimbolos";

export type Ferramentas = { defs: ToolDef[]; executar: (nome: string, argsJson: string) => Promise<string> };

const MAX_SECCAO = 7000;
const eur = (v: number | null | undefined) => (v == null ? "—" : `€ ${v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export function criarFerramentasBlock(opts: { seccoes: Seccao[]; userId: string; anoAtual?: number }): Ferramentas {
  const catalogo = catalogoSeccoes(opts.seccoes);
  const chaves = [...catalogo.keys()];
  const defs: ToolDef[] = [
    ...(chaves.length ? [{
      type: "function" as const,
      function: {
        name: "ler_seccao",
        description: "Lê uma secção COMPLETA dos dados do utilizador (as do contexto podem vir resumidas ou em falta). Usa quando a pergunta precisa de detalhe que não tens. Secções: " + chaves.join(", ") + ".",
        parameters: { type: "object", properties: { seccao: { type: "string", enum: chaves } }, required: ["seccao"] },
      },
    }] : []),
    {
      type: "function",
      function: {
        name: "precos_atuais",
        description: "Preço atual em USD e variação de 24 h de criptomoedas pelo símbolo (ex.: LINK, DOGE, AVAX), incluindo moedas que o utilizador não tem.",
        parameters: { type: "object", properties: { simbolos: { type: "array", items: { type: "string" }, maxItems: 10 } }, required: ["simbolos"] },
      },
    },
    {
      type: "function",
      function: {
        name: "estimativa_fiscal",
        description: "Estimativa do imposto sobre mais-valias cripto do utilizador num país e ano, a partir das transações registadas (todas as contas). Países: " + COUNTRIES.map((c) => c.code).join(", ") + ".",
        parameters: { type: "object", properties: { pais: { type: "string", description: "Código ISO-2, ex. PT" }, ano: { type: "integer" } }, required: ["pais"] },
      },
    },
  ];

  const executar = async (nome: string, argsJson: string): Promise<string> => {
    let args: Record<string, unknown> = {};
    try { args = argsJson ? (JSON.parse(argsJson) as Record<string, unknown>) : {}; } catch { /* argumentos vazios */ }
    try {
      if (nome === "ler_seccao") {
        const s = catalogo.get(String(args.seccao ?? ""));
        if (!s) return `Secção desconhecida. Disponíveis: ${chaves.join(", ")}.`;
        const corpo = s.corpo.length > MAX_SECCAO ? s.corpo.slice(0, MAX_SECCAO) + "\n[… cortado]" : s.corpo;
        return `=== ${s.titulo} ===\n${corpo}`;
      }
      if (nome === "precos_atuais") {
        const pedidos = Array.isArray(args.simbolos) ? args.simbolos.map(String) : [];
        const simbolos = simbolosParaMercado(pedidos).filter((s) => pedidos.map((p) => p.toUpperCase()).includes(s));
        if (!simbolos.length) return "Sem símbolos válidos.";
        const precos = await precosOkx24h(Object.fromEntries(simbolos.map((s) => [s, s])));
        if (!precos) return "Preços indisponíveis neste momento.";
        return simbolos.map((s) => precos[s] ? `${s}: $${precos[s].usd} (${precos[s].usd_24h_change >= 0 ? "+" : ""}${precos[s].usd_24h_change.toFixed(1)} % 24 h)` : `${s}: sem par USDT na OKX`).join("\n");
      }
      if (nome === "estimativa_fiscal") {
        const pais = String(args.pais ?? "").toUpperCase();
        const ano = Number.isInteger(args.ano) ? Number(args.ano) : (opts.anoAtual ?? new Date().getFullYear());
        const est = await getTaxEstimate(opts.userId, pais, ano);
        if ("error" in est) return est.message ?? "País desconhecido.";
        return [
          `Estimativa ${ano} para ${pais}: vendas ${est.sales}, mais-valias brutas ${eur(est.totalGain)}, tributável ${eur(est.taxableGain)}, isento ${eur(est.exemptGain)}, menos-valias ${eur(est.losses)}.`,
          `Imposto estimado: ${est.estimatedTax == null ? "não calculável" : eur(est.estimatedTax)}${est.estimatedTaxRange ? ` (intervalo ${eur(est.estimatedTaxRange.min)}–${eur(est.estimatedTaxRange.max)})` : ""}. Taxas: curto ${Math.round(est.rates.short * 100)} %, longo ${Math.round(est.rates.long * 100)} %${est.rates.longTermAfterDays ? ` após ${est.rates.longTermAfterDays} dias` : ""}.`,
          "warning" in est && est.warning ? `AVISO: ${est.warning}` : "",
          "É uma estimativa; recomenda validar com contabilista.",
        ].filter(Boolean).join("\n");
      }
      return `Ferramenta desconhecida: ${nome}`;
    } catch (e) {
      console.error(`[gestor] ferramenta ${nome} falhou:`, e instanceof Error ? e.message : e);
      return "A ferramenta falhou neste momento; responde com o que tens.";
    }
  };

  return { defs, executar };
}
