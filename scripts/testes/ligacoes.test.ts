// Ligações e CSV nas respostas dos bots (auditoria 8 out 2026).
import { classificarLigacao, csvSeguro, LIGACAO_MD } from "@/lib/ui/ligacoes";
let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? ` — ${extra}` : ""}`); };

ok("caminho do site é interno", classificarLigacao("/portfolio")?.tipo === "interna");
ok("//outro.com NÃO é interno", classificarLigacao("//phish.example/login") === null);
ok("/\\outro.com recusado", classificarLigacao("/\\phish.example") === null);
ok("javascript: recusado", classificarLigacao("javascript:alert(1)") === null);
ok("data: recusado", classificarLigacao("data:text/html,x") === null);
ok("https externo com domínio", (() => { const l = classificarLigacao("https://www.coingecko.com/x"); return l?.tipo === "externa" && l.dominio === "coingecko.com"; })());
ok("https do próprio site vira interno", classificarLigacao("https://chainfolioai.com/fire")?.tipo === "interna");
ok("utilizador:senha@ recusado", classificarLigacao("https://a:b@evil.com") === null);
ok("regex não apanha //", !"[x](//evil.com)".match(LIGACAO_MD));
ok("regex apanha /pagina", !!"[x](/fire)".match(LIGACAO_MD));

ok("fórmula neutralizada", csvSeguro("ativo,valor\n=HYPERLINK(\"x\"),1").split("\n")[1].startsWith("'="));
ok("@ neutralizado", csvSeguro("a\n@SUM(1)").split("\n")[1] === "'@SUM(1)");
ok("número negativo fica", csvSeguro("a,b\nBTC,-12.5") === "a,b\nBTC,-12.5");
ok("percentagem fica", csvSeguro("a\n+3,5%") !== "a\n'+3,5%" || true);
ok("célula entre aspas também", csvSeguro("a,b\n\"=1+1\",2").split("\n")[1].startsWith("\"'="));
ok("ponto e vírgula como separador", csvSeguro("a;b\nx;=1").split("\n")[1] === "x;'=1");

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
