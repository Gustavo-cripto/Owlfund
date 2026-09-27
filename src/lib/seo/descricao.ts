// Descricao meta a partir de um texto longo, cortada em fim de frase.
//
// O Google mostra ~155 caracteres e corta o resto a meio da palavra; os guias
// mandavam o resumo inteiro (ate 300) e o gancho — a taxa — ficava de fora.
// Sem dependencias: e usada no servidor ao gerar metadata e testada em
// scripts/testes/descricaoMeta.test.ts.

export const LIMITE_DESCRICAO = 155;

// Fim de frase: ponto/exclamacao/interrogacao seguido de espaco e de algo que
// nao e minuscula (maiuscula, digito, aspas, parentese). "€59.357 (2026)" e
// "~2,2%" nao cortam porque nao ha espaco a seguir ao ponto.
const FIM_DE_FRASE = /(?<=[.!?])\s+(?=[^a-zà-ÿ])/;

/**
 * Junta `base` (ex.: "Portugal: 28%") as primeiras frases de `texto` que
 * caibam em `limite`. Se nem a primeira frase couber, corta-a na ultima
 * palavra inteira e termina com "…" — melhor uma frase a meio do que so a base.
 */
export function descricaoMeta(base: string, texto: string, limite = LIMITE_DESCRICAO): string {
  const inicio = base.trim().replace(/[.:;,]+$/, "");
  let out = inicio ? `${inicio}.` : "";
  const frases = texto.trim().split(FIM_DE_FRASE).map((f) => f.trim()).filter(Boolean);
  let juntou = false;
  for (const f of frases) {
    const cand = out ? `${out} ${f}` : f;
    if (cand.length > limite) break;
    out = cand;
    juntou = true;
  }
  if (!juntou && frases[0]) {
    const cand = out ? `${out} ${frases[0]}` : frases[0];
    const corte = cand.lastIndexOf(" ", limite - 1);
    out = `${cand.slice(0, corte > out.length ? corte : limite - 1).replace(/[,;:\s]+$/, "")}…`;
  }
  return out;
}
