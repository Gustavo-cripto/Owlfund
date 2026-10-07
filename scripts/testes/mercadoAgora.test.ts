import { simbolosDaPergunta, MAJORS_CHAIN } from "@/lib/ai/mercadoSimbolos";
import { simbolosParaMercado } from "@/lib/ai/mercadoSimbolos";
import { temasDaPergunta } from "@/lib/ai/orcamentoBlock";
let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`); };
const s = simbolosParaMercado(["usdc", "eth", "link", "LINK", "pepe!", "USDT", "x".repeat(12)]);
ok("base primeiro, sem estáveis nem repetidos, limpos", s.join(",") === "BTC,ETH,SOL,LINK,PEPE", s.join(","));
ok("limite de 15", simbolosParaMercado(Array.from({ length: 40 }, (_, i) => `T${i}`)).length === 15);
ok("'porque caiu hoje' → mercado", temasDaPergunta("Porque é que o meu portefólio caiu hoje?").has("mercado"));
ok("'why is bitcoin down' → mercado", temasDaPergunta("Why is bitcoin down?").has("mercado"));

// Chain: moedas citadas na pergunta
{
  const ok2 = (n: string, c: boolean) => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}`); };
  ok2("nome por extenso", JSON.stringify(simbolosDaPergunta("Quanto está o bitcoin hoje?")) === JSON.stringify(["BTC"]));
  ok2("acentos e várias", JSON.stringify(simbolosDaPergunta("E a Solana e o Ethereum?")) === JSON.stringify(["SOL", "ETH"]));
  ok2("sigla em maiúsculas", simbolosDaPergunta("como está o LINK e o PEPE").includes("PEPE"));
  ok2("ignora siglas que não são moedas", simbolosDaPergunta("O que é um ETF e o PNL?").length === 0);
  ok2("sem repetidos", JSON.stringify(simbolosDaPergunta("BTC bitcoin BTC")) === JSON.stringify(["BTC"]));
  ok2("majors do Chain sem BTC/ETH/SOL", !MAJORS_CHAIN.some((s) => ["BTC", "ETH", "SOL"].includes(s)));
}
if (fails) { console.log(`\n${fails} teste(s) falhados`); process.exit(1); }
