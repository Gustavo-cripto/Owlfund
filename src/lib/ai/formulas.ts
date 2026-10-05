// Os modelos de IA escrevem fórmulas em LaTeX (\[ \frac{a}{b} \], \text{…})
// mesmo quando o prompt pede texto simples. Os chats do site não têm KaTeX e
// mostravam o código à letra. Isto converte o LaTeX mais comum em texto
// legível antes de renderizar — e os prompts pedem para não usar LaTeX, por
// isso isto é a rede de segurança, não o caminho normal.

const SIMBOLOS: Array<[RegExp, string]> = [
  [/\\times\b/g, "×"], [/\\cdot\b/g, "·"], [/\\div\b/g, "÷"], [/\\pm\b/g, "±"],
  [/\\approx\b/g, "≈"], [/\\neq?\b/g, "≠"], [/\\leq?\b/g, "≤"], [/\\geq?\b/g, "≥"],
  [/\\sum\b/g, "Σ"], [/\\infty\b/g, "∞"], [/\\%/g, "%"], [/\\&/g, "&"], [/\\_/g, "_"],
  [/\\(?:left|right|displaystyle|quad|qquad)\b/g, ""],
  [/\\[,;:! ]/g, " "],
];

/** Há LaTeX no texto? (delimitadores ou comandos habituais) */
export function temLatex(texto: string): boolean {
  return /\\\[|\\\]|\\\(|\\\)|\$\$|\\frac|\\text\{|\\mathrm\{|\\sqrt/.test(texto);
}

// Substitui comandos com UM argumento entre chavetas, do interior para fora,
// para aguentar \frac{\text{a}}{\text{b}}.
function argumentos(s: string): string {
  let anterior = "";
  while (anterior !== s) {
    anterior = s;
    s = s.replace(/\\(?:text|mathrm|textbf|mathbf|operatorname)\{([^{}]*)\}/g, "$1");
    s = s.replace(/\\sqrt\{([^{}]*)\}/g, "√($1)");
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, (_m, a: string, b: string) => `(${a.trim()}) / (${b.trim()})`);
    s = s.replace(/\^\{([^{}]*)\}/g, "^($1)");
    s = s.replace(/_\{([^{}]*)\}/g, "_$1");
  }
  return s;
}

/** Converte o LaTeX habitual em texto simples. Texto sem LaTeX sai igual. */
export function semLatex(texto: string): string {
  if (!temLatex(texto)) return texto;
  let s = texto;
  // Blocos \[ … \] e $$ … $$ ficam numa linha própria; \( … \) fica em linha.
  s = s.replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_m, f: string) => `\n${f.replace(/\s*\n\s*/g, " ").trim()}\n`);
  s = s.replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, (_m, f: string) => `\n${f.replace(/\s*\n\s*/g, " ").trim()}\n`);
  s = s.replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, (_m, f: string) => f.trim());
  s = argumentos(s);
  for (const [re, sub] of SIMBOLOS) s = s.replace(re, sub);
  // Comandos que sobraram (\alpha, \Delta…): fica a palavra.
  s = s.replace(/\\([A-Za-z]+)/g, "$1");
  // Chavetas soltas de argumentos já resolvidos.
  s = s.replace(/[{}]/g, "");
  return s.replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n");
}
