// Ligações e CSV nas respostas dos bots (auditoria 8 out 2026). Puro, testado em
// scripts/testes/ligacoes.test.ts; usado por src/components/ChatMarkdown.tsx.

export type Ligacao =
  | { tipo: "interna"; href: string }
  | { tipo: "externa"; href: string; dominio: string };

const SITE = "chainfolioai.com";

/**
 * Decide se um href de markdown é uma página do site, uma ligação externa ou
 * nada (null = mostrar como texto). "//outro.com" e "/\\outro.com" pareciam
 * caminhos do site mas o browser abre outro domínio: nunca são internos.
 */
export function classificarLigacao(href: string): Ligacao | null {
  const h = String(href ?? "").trim();
  if (!h || /[\s\\]/.test(h) || /[\u0000-\u001f]/.test(h)) return null;
  if (/^\/(?!\/)/.test(h)) return { tipo: "interna", href: h };
  let url: URL;
  try { url = new URL(h); } catch { return null; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === SITE || host === `www.${SITE}`) return { tipo: "interna", href: `${url.pathname}${url.search}${url.hash}` || "/" };
  return { tipo: "externa", href: url.toString(), dominio: host.replace(/^www\./, "") };
}

/** [texto](href) com href que comece por "/" (sem "//") ou por http(s)://. */
export const LIGACAO_MD = /(\[[^\]\n]+\]\((?:\/(?![\/\\])[^\s)]*|https?:\/\/[^\s)]+)\))/g;

/**
 * CSV seguro para abrir no Excel/Sheets: uma célula começada por = + - @, tab ou
 * CR é executada como fórmula (injeção de fórmulas). Prefixa-se um apóstrofo,
 * exceto em números válidos (−12,5 / -12.5 / +3).
 */
export function csvSeguro(csv: string): string {
  return String(csv ?? "").split("\n").map((linha) => {
    const sep = linha.includes(";") && !linha.includes(",") ? ";" : ",";
    const celulas: string[] = [];
    let atual = "", aspas = false;
    for (let i = 0; i < linha.length; i++) {
      const c = linha[i];
      if (c === '"') { aspas = !aspas; atual += c; continue; }
      if (c === sep && !aspas) { celulas.push(atual); atual = ""; continue; }
      atual += c;
    }
    celulas.push(atual);
    return celulas.map((cel) => {
      const nua = cel.trim().replace(/^"|"$/g, "");
      if (!/^[=+\-@\t\r]/.test(nua)) return cel;
      if (/^[+\-]?\d+([.,]\d+)?%?$/.test(nua)) return cel;
      const aspada = /^\s*"/.test(cel);
      return aspada ? cel.replace(/"/, "\"'") : `'${cel}`;
    }).join(sep);
  }).join("\n");
}
