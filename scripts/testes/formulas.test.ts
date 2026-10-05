import { semLatex, temLatex } from "@/lib/ai/formulas";
let fails = 0;
const eq = (name: string, got: string, want: string) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : `\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`}`); };

eq("texto normal sai igual", semLatex("Subiu **8,1 %** em 60 dias."), "Subiu **8,1 %** em 60 dias.");
eq("caminho de ficheiro Windows não é LaTeX", semLatex("C:\\temp\\x"), "C:\\temp\\x");
console.log(`${!temLatex("sem nada") ? "✅" : "❌"} temLatex falso sem LaTeX`);

// O caso real do ecrã do Block.
const real = "Fórmula\n\n\\[\n\\text{Variação\\%} = \\frac{\\text{Valor\\ atual} - \\text{Valor\\ há\\,60\\,dias}}{\\text{Valor\\ há\\,60\\,dias}} \\times 100\n\\]\n\n---";
eq("bloco \\[ \\] vira texto legível", semLatex(real), "Fórmula\n\nVariação% = (Valor atual - Valor há 60 dias) / (Valor há 60 dias) × 100\n\n---");

eq("\\( \\) em linha", semLatex("logo \\(x \\approx 2\\) euros"), "logo x ≈ 2 euros");
eq("$$ $$ fica em linha própria", semLatex("a\n$$ \\frac{a}{b} $$\nb"), "a\n\n(a) / (b)\n\nb");
eq("frac aninhado", semLatex("\\[\\frac{\\frac{1}{2}}{3}\\]"), "\n((1) / (2)) / (3)\n");
eq("sqrt e potência", semLatex("\\(\\sqrt{x^{2}} \\geq 0\\)"), "√(x^(2)) ≥ 0");
eq("\\left \\right desaparecem, \\le fica ≤", semLatex("\\(\\left(a\\right) \\le b\\)"), "(a) ≤ b");
eq("comando desconhecido fica a palavra", semLatex("\\(\\Delta x\\)"), "Delta x");

if (fails) { console.log(`\n${fails} teste(s) falhados`); process.exit(1); }
