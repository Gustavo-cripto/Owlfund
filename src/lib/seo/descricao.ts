// Descricao meta a partir de um texto longo, cortada em fim de frase.
//
// O Google mostra ~155 caracteres e corta o resto a meio da palavra; os guias
// mandavam o resumo inteiro (ate 300) e o gancho — a taxa — ficava de fora.
// Sem dependencias: e usada no servidor ao gerar metadata e testada em
// scripts/testes/descricaoMeta.test.ts.

export const LIMITE_DESCRICAO = 155;
// Abaixo disto o Google tende a completar com texto da pagina ao acaso: se as
// frases inteiras nao chegam ca, entra um pedaco da seguinte cortado em palavra.
export const MINIMO_DESCRICAO = 120;
// Tolerancia do teste dos guias (scripts/testes/seoMeta.test.ts): 115 e nao 120.
// O minimo acima e um objetivo, nao uma garantia — quando as frases inteiras
// nao chegam a 120 e o pedaco da frase seguinte que caberia tem menos de
// PEDACO_MINIMO (30) caracteres, preferimos parar na frase inteira a acabar em
// "Doi…". Hoje o guia mais curto fica a 119 (pt/luxemburgo). Os 5 de folga
// deixam passar esse caso e apanham uma regressao a serio (ex.: descricao so
// com "Pais: taxa."). Se um guia novo cair abaixo, reescrever o resumo dele,
// nao baixar este numero.
export const MINIMO_DESCRICAO_GUIAS = MINIMO_DESCRICAO - 5;
// Um pedaco cortado so vale a pena se acrescentar algumas palavras; "Doi…" e
// pior do que parar na frase inteira.
const PEDACO_MINIMO = 30;

// Fim de frase: ponto/exclamacao/interrogacao seguido de espaco e de algo que
// nao e minuscula (maiuscula, digito, aspas, parentese). "€59.357 (2026)" e
// "~2,2%" nao cortam porque nao ha espaco a seguir ao ponto.
// Fim de frase — mas não depois de abreviaturas de lei ("art. 93", "n.º 8", "s. 38").
const FIM_DE_FRASE = /(?<=[.!?])(?<!\b(?:art|arts|al|inc|nr|Nr|Abs|s|n\.º)\.)\s+(?=[^a-zà-ÿ])/;

/**
 * Junta `base` (ex.: "Portugal: 28%") as primeiras frases de `texto` que
 * caibam em `limite`. Se nem a primeira frase couber, corta-a na ultima
 * palavra inteira e termina com "…" — melhor uma frase a meio do que so a base.
 * Se as frases inteiras ficarem abaixo de `minimo`, a frase seguinte entra
 * cortada em palavra com "…" (desde que acrescente um pedaco com sentido).
 */
export function descricaoMeta(base: string, texto: string, limite = LIMITE_DESCRICAO, minimo = MINIMO_DESCRICAO): string {
  const inicio = base.trim().replace(/[.:;,]+$/, "");
  let out = inicio ? `${inicio}.` : "";
  const frases = texto.trim().split(FIM_DE_FRASE).map((f) => f.trim()).filter(Boolean);
  let juntadas = 0;
  for (const f of frases) {
    const cand = out ? `${out} ${f}` : f;
    if (cand.length > limite) break;
    out = cand;
    juntadas++;
  }
  const seguinte = frases[juntadas];
  if (!seguinte) return out;
  const cand = out ? `${out} ${seguinte}` : seguinte;
  const corte = cand.lastIndexOf(" ", limite - 1);
  if (juntadas === 0) {
    out = `${cand.slice(0, corte > out.length ? corte : limite - 1).replace(/[,;:\s]+$/, "")}…`;
  } else if (out.length < minimo && corte - out.length >= PEDACO_MINIMO) {
    out = `${cand.slice(0, corte).replace(/[,;:\s]+$/, "")}…`;
  }
  return out;
}
