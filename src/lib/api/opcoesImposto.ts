import type { Country } from "@/lib/tax/countries";
import type { TaxaPessoal } from "@/lib/tax/regras";

// Opções da estimativa de imposto na API e no MCP: as mesmas escolhas que a
// página da fiscalidade deixa fazer. Sem base de dados, para poder ser testado.

/** Escolhas que a página deixa fazer e que a API também aceita. */
export type OpcoesEstimativa = {
  /** A opção alternativa de "onde estão as moedas" (BR, PT, AR, AT). */
  alternative?: boolean;
  /** Taxa marginal da pessoa, em fração (0.35 = 35%), onde a taxa depende do rendimento. */
  marginalRate?: number;
  /** EUA: taxa de longo prazo da pessoa (0, 0.15 ou 0.20, mais 3,8% NIIT se aplicável). */
  marginalRateLong?: number;
};

// O que cada escolha significa, para quem chama a API saber o que pedir.
export const ALTERNATIVA_EN: Record<string, { default: string; alternative: string }> = {
  br: { default: "Crypto on Brazilian exchanges: monthly assessment, months with sales ≤ R$35,000 exempt, 15–22.5% by gain.", alternative: "Crypto on foreign exchanges or self-custody (Law 14.754/2023): 15%, annual, no exemption." },
  pt: { default: "Counterparty (exchange) resident in the EU/EEA or a treaty country: 365-day exclusion and swap neutrality apply.", alternative: "Counterparty in another country: no 365-day exclusion and crypto-to-crypto swaps are taxed (CIRS art. 10(24))." },
  ar: { default: "Sales in foreign currency or on a foreign platform: 15%.", alternative: "Sales in pesos without an adjustment clause: 5%." },
  at: { default: "Foreign platform: the 27.5% is declared by you.", alternative: "Austrian platform: the 27.5% KESt is already withheld at source; the estimate is what was withheld, not an extra amount." },
};

export function opcoesDoPais(pais: Pick<Country, "regras">) {
  const alt = pais.regras?.alternativa;
  const tm = pais.regras?.taxaMarginal;
  return {
    ...(alt ? { alternative: ALTERNATIVA_EN[alt.id] } : {}),
    ...(tm ? { marginalRate: tm.longo === "separado" ? "marginalRate (short-term) and marginalRateLong (long-term), as fractions" : "marginalRate, as a fraction (0.35 = 35%)" } : {}),
    ...(pais.regras?.perdasTransitam ? { lossCarryForward: pais.regras.perdasTransitam.anos ? `yes, ${pais.regras.perdasTransitam.anos} years` : "yes, no time limit" } : {}),
  };
}

/** Valida as opções para um país; devolve o erro para o cliente ou o que o motor usa. */
export function validarOpcoes(pais: Pick<Country, "code" | "regras">, opcoes: OpcoesEstimativa):
  { error: string; message: string } | { alternativa: boolean; taxaPessoal: TaxaPessoal | undefined } {
  const alt = pais.regras?.alternativa;
  const tm = pais.regras?.taxaMarginal;
  if (opcoes.alternative && !alt) {
    return { error: "option_not_available", message: `${pais.code} has no "alternative" option. Countries with it: BR, PT, AR, AT.` };
  }
  if ((opcoes.marginalRate != null || opcoes.marginalRateLong != null) && !tm) {
    return { error: "option_not_available", message: `${pais.code} has a fixed rate; marginalRate only applies where the rate depends on income (DE, GB, US, CA, AU, LU, MX).` };
  }
  if (opcoes.marginalRateLong != null && tm?.longo !== "separado") {
    return { error: "option_not_available", message: "marginalRateLong only applies to US." };
  }
  for (const v of [opcoes.marginalRate, opcoes.marginalRateLong]) {
    if (v != null && !(Number.isFinite(v) && v >= 0 && v <= 0.6)) {
      return { error: "invalid_rate", message: "Rates are fractions between 0 and 0.6 (0.35 = 35%)." };
    }
  }
  const taxaPessoal: TaxaPessoal | undefined = opcoes.marginalRate != null || opcoes.marginalRateLong != null
    ? { ...(opcoes.marginalRate != null ? { curto: opcoes.marginalRate } : {}), ...(opcoes.marginalRateLong != null ? { longo: opcoes.marginalRateLong } : {}) }
    : undefined;
  return { alternativa: !!opcoes.alternative, taxaPessoal };
}
