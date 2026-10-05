// Avaliação OFFLINE do Block: a montagem do contexto para cada pergunta da
// bateria escolhe as secções certas, cabe no orçamento do Groq e as etiquetas/
// LaTeX de respostas típicas são tratadas. Corre em cada `npm run verificar`.
// A parte com modelo real está em avaliacaoAoVivo.test.ts (precisa de chaves).
import { CENARIO_BLOCK, PERGUNTAS_AVALIACAO } from "@/lib/ai/avaliacaoBlock";
import { cortarHistorico, estimarTokens, partirSeccoes, selecionarSeccoes, temasDaPergunta } from "@/lib/ai/orcamentoBlock";
import { promptSistemaBlock } from "@/lib/ai/promptBlock";
import { extrairEtiquetas } from "@/lib/ai/etiquetasBlock";
import { semLatex } from "@/lib/ai/formulas";
let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`); };

const TETO = 8000, RESPOSTA = 1800, MARGEM = 400;
const seccoes = partirSeccoes(CENARIO_BLOCK);
ok("cenário tem 9 secções", seccoes.length === 9, String(seccoes.length));

for (const q of PERGUNTAS_AVALIACAO) {
  const base = promptSistemaBlock("pt-PT", "");
  const orcamentoChars = (TETO - RESPOSTA - MARGEM) * 2.6;
  const sobra = Math.max(2000, orcamentoChars - base.length);
  const conversa = cortarHistorico([{ role: "user", content: q.pergunta }], Math.floor(sobra / 3));
  const dados = selecionarSeccoes(seccoes, q.pergunta, sobra - q.pergunta.length);
  const tokens = estimarTokens(base + dados) + conversa.reduce((n, m) => n + estimarTokens(m.content), 0);
  ok(`[${q.id}] cabe no Groq (${tokens} + ${RESPOSTA} ≤ ${TETO})`, tokens + RESPOSTA <= TETO);
  for (const t of q.seccoesEsperadas) ok(`[${q.id}] contexto inclui "${t}"`, dados.includes(`=== ${t}`), [...temasDaPergunta(q.pergunta)].join(","));
  ok(`[${q.id}] memória e totais entram sempre`, dados.includes("O QUE SEI") && dados.includes("Valor total"));
}

// Respostas típicas de modelo: etiquetas retiradas, LaTeX convertido.
const resposta = "Subiu **€ 66,78 (+8,1 %)** em 60 dias.\n\n\\[ \\text{Variação} = \\frac{886,78 - 820}{820} \\times 100 \\]\n\n<lembrar>Declara impostos em Portugal</lembrar>\n<sugestoes>E a 90 dias? | Que posições DeFi tenho? | Qual o meu número FIRE?</sugestoes>";
const e = extrairEtiquetas(resposta);
ok("etiquetas retiradas e 3 sugestões", !/<sugestoes>|<lembrar>/.test(e.texto) && e.sugestoes.length === 3 && e.lembrar.length === 1);
ok("LaTeX da resposta vira texto", semLatex(e.texto).includes("(886,78 - 820) / (820) × 100") && !semLatex(e.texto).includes("\\frac"));

if (fails) { console.log(`\n${fails} teste(s) falhados`); process.exit(1); }
