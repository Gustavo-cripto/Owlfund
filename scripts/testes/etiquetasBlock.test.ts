import { extrairEtiquetas, ocultarEtiquetasParciais } from "@/lib/ai/etiquetasBlock";
let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`); };

const r = extrairEtiquetas("O teu portefólio subiu **8 %**.\n\n<lembrar>Declara impostos em Portugal</lembrar>\n<sugestoes>E a 90 dias? | Que posições DeFi tenho? | Qual o meu número FIRE?</sugestoes>");
ok("texto limpo sem etiquetas", r.texto === "O teu portefólio subiu **8 %**.", r.texto);
ok("1 nota", r.lembrar.length === 1 && r.lembrar[0] === "Declara impostos em Portugal");
ok("3 sugestões", r.sugestoes.length === 3 && r.sugestoes[1] === "Que posições DeFi tenho?");

ok("sem etiquetas sai igual", extrairEtiquetas("Olá").texto === "Olá" && extrairEtiquetas("Olá").sugestoes.length === 0);
ok("máximo 2 notas", extrairEtiquetas("<lembrar>a</lembrar><lembrar>b</lembrar><lembrar>c</lembrar>").lembrar.length === 2);
ok("máximo 3 sugestões, sem repetidas", extrairEtiquetas("<sugestoes>a|b|a|c|d</sugestoes>").sugestoes.join(",") === "a,b,c");
ok("sugestões por linha com marcadores", extrairEtiquetas("<sugestoes>\n- Uma\n- Duas\n</sugestoes>").sugestoes.join(",") === "Uma,Duas");
ok("etiqueta aberta sem fecho desaparece", extrairEtiquetas("Texto\n<sugestoes>a | b").texto === "Texto");
ok("parcial esconde a partir da etiqueta", ocultarEtiquetasParciais("Texto final.\n<suges") === "Texto final.");
ok("parcial sem etiqueta sai igual", ocultarEtiquetasParciais("Texto") === "Texto");

if (fails) { console.log(`\n${fails} teste(s) falhados`); process.exit(1); }
