// Origem de uma visita: a REDE (?src=bluesky ou ?utm_source=) e, opcional, a
// CAMPANHA (?campanha=isencao ou ?utm_campaign=). Grava-se "rede.campanha" num
// só campo (page_views.src, cookie cfa-src, user_metadata.src, nota do beta):
// assim não é preciso coluna nova, e as estatísticas agrupam pela rede e
// mostram as campanhas à parte. Antes, um post com ?src=isencao perdia a rede.

const FORA = /[^a-zA-Z0-9_-]/g;
const MAX = 40;

/** Limpa um valor já gravado ("rede" ou "rede.campanha"). */
export function limparOrigem(valor: unknown): string {
  if (typeof valor !== "string") return "";
  const [rede = "", campanha = ""] = valor.split(".");
  return juntar(rede.replace(FORA, ""), campanha.replace(FORA, ""));
}

/** A origem a partir dos parâmetros do URL. */
export function origemDoUrl(params: URLSearchParams): string {
  const rede = (params.get("src") ?? params.get("utm_source") ?? "").replace(FORA, "");
  const campanha = (params.get("campanha") ?? params.get("utm_campaign") ?? "").replace(FORA, "");
  return juntar(rede, campanha);
}

function juntar(rede: string, campanha: string): string {
  const r = rede.slice(0, MAX);
  if (!r) return "";
  const c = campanha.slice(0, MAX - r.length - 1);
  return c ? `${r}.${c}` : r;
}

/** Só a rede ("bluesky.isencao" → "bluesky"). */
export const redeDe = (origem: string): string => origem.split(".")[0];

/** Padrão para ler a origem de um cookie ou nota, já com a campanha. */
export const ORIGEM_PADRAO = "[A-Za-z0-9_-]{1,40}(?:\\.[A-Za-z0-9_-]{1,39})?";
