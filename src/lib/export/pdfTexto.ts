// O jsPDF, com as fontes base (helvetica), só escreve bem o Windows-1252: um
// único caracter fora dele (≥, ≈, →, ou o espaço fino que o francês usa nos
// milhares, "1 234 €") estraga a linha inteira ("A"e365"). paraPdf troca esses
// caracteres por equivalentes e tira os que não têm (emojis).

const WIN1252_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
const TROCAS: Record<string, string> = {
  " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
  "‑": "-", "‐": "-", "−": "-",
  "≥": ">=", "≤": "<=", "≈": "~", "≠": "!=",
  "→": "->", "←": "<-", "⇄": "<->", "↔": "<->",
  "▲": "", "▼": "",
};

export function paraPdf(s: string): string {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if ((cp <= 0xff && (cp < 0x80 || cp > 0x9f)) || WIN1252_EXTRA.has(ch)) out += ch;
    else out += TROCAS[ch] ?? "";
  }
  return out;
}

/** Passa todo o texto escrito com doc.text por paraPdf. */
export function protegerTextoPdf(doc: object): void {
  const d = doc as { text: (texto: string | string[], ...resto: unknown[]) => unknown };
  const original = d.text.bind(doc);
  d.text = (texto, ...resto) => original(Array.isArray(texto) ? texto.map(paraPdf) : paraPdf(String(texto)), ...resto);
}
