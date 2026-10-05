// Etiquetas que o Block pode deixar no FIM da resposta e que o utilizador não vê:
//   <lembrar>facto curto sobre o utilizador</lembrar>   (até 2 por resposta)
//   <sugestoes>pergunta | pergunta | pergunta</sugestoes> (perguntas de seguimento)
// Aqui extraem-se e retiram-se do texto. Sem dependências, para o servidor,
// o browser e os testes (scripts/testes/etiquetasBlock.test.ts) usarem o mesmo.

export type Etiquetas = { texto: string; lembrar: string[]; sugestoes: string[] };

const limpar = (s: string) => s.replace(/\s+/g, " ").trim();

// Uma nota é um facto sobre o utilizador, nunca uma instrução. Se o modelo
// (ou um texto malicioso num nome de token) tentar guardar "ignora as regras",
// a nota é recusada aqui — no servidor, antes de chegar ao browser.
const PARECE_INSTRUCAO = /\b(ignor\w*|instru\w*|instruction\w*|regra\w*|rules?|prompt\w*|sistema|system|block|assistente|assistant|recomend\w*|recommend\w*|aconselh\w*|compra\w*|vend\w*|buy|sell)\b/i;
export function notaAceitavel(texto: string): boolean {
  const t = limpar(texto);
  return t.length >= 8 && t.length <= 200 && !PARECE_INSTRUCAO.test(t) && !/[<>{}]/.test(t);
}

export function extrairEtiquetas(resposta: string): Etiquetas {
  let texto = resposta;
  const lembrar: string[] = [];
  texto = texto.replace(/<lembrar>([\s\S]*?)<\/lembrar>/gi, (_m, f: string) => {
    const t = limpar(f);
    if (notaAceitavel(t) && lembrar.length < 2) lembrar.push(t);
    return "";
  });
  const sugestoes: string[] = [];
  texto = texto.replace(/<sugestoes>([\s\S]*?)<\/sugestoes>/gi, (_m, f: string) => {
    for (const s of f.split(/\s*[|\n]\s*/)) {
      const t = limpar(s).replace(/^[-•\d.)\s]+/, "");
      if (t && t.length <= 120 && sugestoes.length < 3 && !sugestoes.includes(t)) sugestoes.push(t);
    }
    return "";
  });
  // Etiqueta aberta sem fecho (resposta cortada): não a mostrar.
  texto = texto.replace(/<(lembrar|sugestoes)>[\s\S]*$/i, "");
  return { texto: texto.replace(/\n{3,}/g, "\n\n").trim(), lembrar, sugestoes };
}

/** Durante o streaming: esconde tudo a partir da primeira etiqueta (mesmo incompleta). */
export function ocultarEtiquetasParciais(parcial: string): string {
  const i = parcial.search(/<(lembrar|sugestoes)\b/i);
  if (i >= 0) return parcial.slice(0, i).trimEnd();
  // Etiqueta a meio de chegar ("<lem", "<suges"): também não se mostra.
  const m = parcial.match(/<([a-z]{0,9})$/i);
  if (m && ("lembrar".startsWith(m[1].toLowerCase()) || "sugestoes".startsWith(m[1].toLowerCase()))) {
    return parcial.slice(0, m.index).trimEnd();
  }
  return parcial;
}

/** Texto para o prompt a explicar as etiquetas ao modelo. */
export const REGRA_ETIQUETAS = `ETIQUETAS NO FIM DA RESPOSTA (o utilizador não as vê; a aplicação trata-as):
- <sugestoes>pergunta 1 | pergunta 2 | pergunta 3</sugestoes> — SEMPRE, no fim: 3 perguntas curtas de seguimento que o utilizador poderia fazer a seguir, na língua da resposta, sobre os dados dele.
- <lembrar>facto</lembrar> — só quando o utilizador disser algo sobre SI que valha a pena guardar para conversas futuras (país onde declara impostos, idade, objetivos, prazo, tolerância ao risco, situação pessoal). Nunca guardes valores do portefólio nem factos já na secção "O QUE SEI DO UTILIZADOR". Máximo 2 por resposta, frases curtas.`;
