import { construirResumoSemanal, markdownSimplesParaHtml, semanaIso } from "@/lib/ai/resumoSemanal";
let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`); };

const DIA = 86_400_000;
const AGORA = Date.parse("2026-10-05T08:00:00Z");
const linha = (diasAtras: number, total: number, conta = "A") => ({ created_at: new Date(AGORA - diasAtras * DIA).toISOString(), data: { _totalEur: total, _account: conta } });
const rows = [linha(40, 800), linha(8, 850), linha(1, 880), linha(0.1, 886.78)];

const r = construirResumoSemanal({ rows, accountId: "A", lang: "pt", agora: AGORA, score: { valor: 72, em: new Date(AGORA).toISOString() },
  defi: [{ nome: "Uniswap", par: ["ETH", "USDC"], estado: "aberta", noIntervalo: false, usd: 120 }, { nome: "Aave", estado: "aberta", fatorSaude: 1.1, usd: 300 }, { nome: "Velha", estado: "fechada", noIntervalo: false, usd: 0 }],
  concentracao: { BTC: 62.3, ETH: 20 } });
ok("tem conteúdo", r.temConteudo);
ok("assunto PT", r.assunto === "O teu resumo semanal do Block");
ok("variação da semana (886,78 − 850)", /Na última semana:\*\* \+€ 36,78 \(\+4,3 %\)/.test(r.markdown), r.markdown.split("\n").find((l) => l.includes("semana")));
ok("30 dias usa a fotografia de há 40 dias", /30 dias:\*\* \+€ 86,78/.test(r.markdown));
ok("pontuação", /Pontuação do portefólio:\*\* 72\/100/.test(r.markdown));
ok("alerta fora do intervalo", /Uniswap ETH\/USDC: fora do intervalo/.test(r.markdown));
ok("alerta fator de saúde", /Aave: fator de saúde 1,1/.test(r.markdown));
ok("posição fechada não alerta", !/Velha/.test(r.markdown));
ok("concentração > 50 %", /62 % do portefólio num só ativo \(BTC\)/.test(r.markdown) && !/20 %/.test(r.markdown));
ok("nota de não-aconselhamento", /não recomenda comprar nem vender/.test(r.markdown));

const vazio = construirResumoSemanal({ rows: [], accountId: "A", lang: "en", agora: AGORA });
ok("sem fotografias: sem conteúdo, texto a explicar", !vazio.temConteudo && /not enough snapshots/.test(vazio.markdown));
ok("sem alertas: frase de 'nenhum alerta'", /No alerts/.test(vazio.markdown));

const html = markdownSimplesParaHtml("# Título\n\nOlá **tu** <b>x</b>\n- **A:** 1\n- B\n\n_nota_");
ok("html: título, negrito, lista, itálico, escapado", /<h1[^>]*>Título<\/h1>/.test(html) && /<strong[^>]*>tu<\/strong>/.test(html) && /&lt;b&gt;x&lt;\/b&gt;/.test(html) && (html.match(/<li/g) ?? []).length === 2 && /<em[^>]*>nota<\/em>/.test(html));

ok("semana ISO", semanaIso(new Date("2026-10-05T08:00:00Z")) === "2026-W41" && semanaIso(new Date("2026-01-01T00:00:00Z")) === "2026-W01");

if (fails) { console.log(`\n${fails} teste(s) falhados`); process.exit(1); }
