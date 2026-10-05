import { simbolosParaMercado } from "@/lib/ai/mercadoSimbolos";
import { temasDaPergunta } from "@/lib/ai/orcamentoBlock";
let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`); };
const s = simbolosParaMercado(["usdc", "eth", "link", "LINK", "pepe!", "USDT", "x".repeat(12)]);
ok("base primeiro, sem estáveis nem repetidos, limpos", s.join(",") === "BTC,ETH,SOL,LINK,PEPE", s.join(","));
ok("limite de 15", simbolosParaMercado(Array.from({ length: 40 }, (_, i) => `T${i}`)).length === 15);
ok("'porque caiu hoje' → mercado", temasDaPergunta("Porque é que o meu portefólio caiu hoje?").has("mercado"));
ok("'why is bitcoin down' → mercado", temasDaPergunta("Why is bitcoin down?").has("mercado"));
if (fails) { console.log(`\n${fails} teste(s) falhados`); process.exit(1); }
