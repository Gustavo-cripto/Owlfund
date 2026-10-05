// Avaliação AO VIVO do Block: chama o modelo real com o cenário sintético e
// verifica o que a resposta tem de conter/evitar. Só corre com
// AVALIAR_AO_VIVO=1 e GROQ_API_KEY e/ou GEMINI_API_KEY no ambiente:
//   npm run avaliar-bots
// Sem isso sai em silêncio (não faz parte do `verificar`).
import { CENARIO_BLOCK, PERGUNTAS_AVALIACAO } from "@/lib/ai/avaliacaoBlock";
import { promptSistemaBlock } from "@/lib/ai/promptBlock";
import { partirSeccoes, selecionarSeccoes } from "@/lib/ai/orcamentoBlock";
import { extrairEtiquetas } from "@/lib/ai/etiquetasBlock";
import { temLatex } from "@/lib/ai/formulas";
import { generateAiChat } from "@/lib/ai/groq";

const temChaves = Boolean((process.env.GROQ_API_KEY ?? "").trim() || (process.env.GEMINI_API_KEY ?? "").trim());
if (process.env.AVALIAR_AO_VIVO !== "1" || !temChaves) {
  console.log("↷ avaliação ao vivo saltada (AVALIAR_AO_VIVO=1 e chaves de IA necessárias)");
} else {
  (async () => {
    let fails = 0;
    const seccoes = partirSeccoes(CENARIO_BLOCK);
    for (const q of PERGUNTAS_AVALIACAO) {
      const dados = selecionarSeccoes(seccoes, q.pergunta, 12_000);
      const langNome = q.lang === "en" ? "English" : "português europeu (PT-PT)";
      const system = `${promptSistemaBlock("pt-PT", "")}\n\n${dados}\n\nIDIOMA (REGRA ABSOLUTA): Responde SEMPRE e EXCLUSIVAMENTE em ${langNome}.`;
      const t0 = Date.now();
      let bruto = "";
      try { bruto = await generateAiChat([{ role: "system", content: system }, { role: "user", content: q.pergunta }], { maxTokens: 1200, temperature: 0.3 }); }
      catch (e) { console.log(`❌ [${q.id}] sem resposta: ${e instanceof Error ? e.message : e}`); fails++; continue; }
      const { texto, sugestoes } = extrairEtiquetas(bruto);
      const ms = Date.now() - t0;
      const problemas: string[] = [];
      for (const re of q.deve) if (!re.test(texto)) problemas.push(`falta ${re}`);
      for (const re of q.naoDeve) if (re.test(texto)) problemas.push(`contém ${re}`);
      if (temLatex(bruto)) problemas.push("LaTeX na resposta");
      if (!sugestoes.length) problemas.push("sem <sugestoes>");
      if (problemas.length) { fails++; console.log(`❌ [${q.id}] ${ms} ms — ${problemas.join("; ")}\n   ${texto.slice(0, 300).replace(/\n/g, " ")}`); }
      else console.log(`✅ [${q.id}] ${ms} ms — ${texto.slice(0, 120).replace(/\n/g, " ")}…`);
    }
    if (fails) { console.log(`\n${fails} pergunta(s) com problemas`); process.exit(1); }
    console.log("\n✅ Avaliação ao vivo em ordem.");
  })();
}
