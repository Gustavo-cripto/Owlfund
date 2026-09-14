import { translations, type Lang } from "@/lib/i18n/translations";
import { TEXT_PREFIX, type CountryText } from "./countries";

// SO SERVIDOR (guias estaticos, metadata, sitemap). Vive fora de countries.ts
// porque esse ficheiro e importado por paginas cliente (fiscalidade) e este
// puxa as quatro linguas — no browser isso custava 182 KB a toda a gente.
/**
 * Textos de um país no idioma pedido. Server-safe: lê o módulo de traduções
 * diretamente, sem o contexto React que só existe no cliente.
 */
export function countryText(code: string, lang: Lang = "pt"): CountryText {
  // Sem prefixo o país mostraria silenciosamente o texto de Portugal — um guia
  // inteiro com a lei errada. Antes rebentar no build (as páginas são estáticas).
  const p = TEXT_PREFIX[code];
  if (!p) throw new Error(`countryText: país sem prefixo de tradução em TEXT_PREFIX: ${code}`);
  const dict = translations[lang] as Record<string, string>;
  const get = (suffix: string) => dict[`fc_${p}_${suffix}`] ?? "";
  return {
    name: get("name"),
    taxShort: get("short"),
    taxLong: get("long"),
    threshold: get("thr"),
    summary: get("sum"),
    keyPoints: get("kp").split("\n").filter(Boolean),
  };
}

