import { fimDeMes, serieDaConta, textoHistorico, textoSemHistorico } from "@/lib/ai/historicoTexto";
let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`); };

const DIA = 86_400_000;
const AGORA = Date.parse("2026-10-05T12:00:00Z");
const iso = (diasAtras: number) => new Date(AGORA - diasAtras * DIA).toISOString();
const linha = (diasAtras: number, total: number | null, conta?: string) =>
  ({ created_at: iso(diasAtras), data: { _totalEur: total, _account: conta } });

// Conta A com 70 dias de fotografias; conta B com outra escala; legado sem etiqueta.
const rows = [
  linha(70, 800, "A"), linha(60, 820, "A"), linha(45, 900, "A"), linha(31, 850, "A"),
  linha(8, 870, "A"), linha(1, 880, "A"),
  linha(2, 5000, "B"), linha(50, 4800, "B"),
  linha(90, 700), // legado: conta para todas
];

// Série da conta A inclui o legado e o valor ao vivo, e exclui a conta B.
const serie = serieDaConta(rows, "A", { agora: AGORA, totalAtual: 886.78 });
ok("série só da conta A + legado + ao vivo", serie.length === 8, String(serie.length));
ok("nenhum ponto da conta B", !serie.some((p) => p.total >= 4000));
ok("último ponto é o valor ao vivo", serie[serie.length - 1].total === 886.78);

const txt = textoHistorico(rows, "A", { agora: AGORA, totalAtual: 886.78, locale: "pt-PT", diasDoPlano: null })!;
ok("60 dias calculados a partir da fotografia de há 60 dias (820)", /60 dias: \+€ 66,78 \(\+8,1 %\) face a € 820,00/.test(txt), txt.split("\n").find((l) => l.includes("60 dias")));
ok("24h usa a fotografia de ontem (880)", /24 horas: \+€ 6,78/.test(txt));
ok("1 ano: sem fotografia (histórico começa há 90 dias)", /1 ano: sem fotografia suficientemente antiga/.test(txt));
ok("desde o início: face ao legado de 700", /desde a primeira fotografia: \+€ 186,78/.test(txt));
ok("conta o número de fotografias sem o ponto ao vivo", /Fotografias usadas: 7\./.test(txt));
ok("máximo e mínimo com datas", /Máximo: € 900,00 em .* · Mínimo: € 700,00 em/.test(txt));
ok("fim de mês listado", /Valor no fim de cada mês/.test(txt));
ok("métricas sobre a série (ROI, queda máxima…)", /Métricas \(sobre as fotografias, \d+ pontos, \d+ dias, sem \d+ salto\(s\) de capital\): ROI .* queda máxima/.test(txt));
ok("nota: não pedir valores ao utilizador", /NUNCA peças ao utilizador/.test(txt));

// Sem accountId → todas as linhas (API/MCP, sem conta); as da conta B (5000)
// caem no filtro de anomalias (4× a mediana), como na API v1.
ok("sem conta usa tudo (menos anomalias)", serieDaConta(rows, "", { agora: AGORA }).length === 7);

// Conta B sozinha (2 fotografias + legado): sem valor ao vivo, a referência é a última fotografia.
const txtB = textoHistorico(rows, "B", { agora: AGORA, locale: "pt-PT" })!;
ok("sem valor ao vivo: referência = última fotografia", /\(última fotografia, /.test(txtB));

// Conta que começou pequena e ligou carteiras depois: o salto é capital, não ganho.
{
  const linhasF = [
    linha(90, 22, "F"), linha(60, 24, "F"), linha(30, 25, "F"), linha(12, 26, "F"),
    linha(2, 292, "F"), linha(1, 576, "F"),
  ];
  const txtF = textoHistorico(linhasF, "F", { agora: AGORA, totalAtual: 531, locale: "pt-PT" })!;
  ok("24 h: perda real (576 → 531), não +2000 %", /24 horas: −€ 45,00 \(−7,8 %\)/.test(txtF), txtF.split("\n").find((l) => l.includes("24 horas")));
  ok("desde o início exclui os saltos de capital", /desde a primeira fotografia: .*excluídos 2 salto\(s\) de capital/.test(txtF), txtF.split("\n").find((l) => l.includes("primeira fotografia:")));
  ok("ROI sem os saltos (não milhares de %)", !/ROI \d{3,}/.test(txtF.replace(/\./g, "")), txtF.split("\n").find((l) => l.startsWith("Métricas")));
  ok("nota sobre entradas de capital", /entradas\/saídas de capital e NÃO são ganho/.test(txtF));
}

// Conta sem fotografias → null (o chamador mete a nota de "sem histórico").
ok("conta sem fotografias → null", textoHistorico([linha(3, 100, "A")], "C", { agora: AGORA }) === null);
ok("só o valor ao vivo também é null", textoHistorico([], "A", { agora: AGORA, totalAtual: 500 }) === null);
ok("nota de sem histórico aponta para /portfolio", /\/portfolio/.test(textoSemHistorico()));

// Fotografias no futuro (relógio desacertado) ficam de fora.
ok("ignora fotografias com data futura", serieDaConta([linha(-1, 999, "A"), linha(1, 100, "A")], "A", { agora: AGORA }).length === 1);

// fimDeMes: última de cada mês, cronológico.
const meses = fimDeMes([
  { t: 1, total: 1, iso: "2026-08-02T00:00:00Z" }, { t: 2, total: 2, iso: "2026-08-30T00:00:00Z" },
  { t: 3, total: 3, iso: "2026-09-10T00:00:00Z" },
]);
ok("fim de mês: última de agosto = 2", meses.length === 2 && meses[0].ponto.total === 2 && meses[1].mes === "2026-09");

// Plano Free: a linha do plano aparece.
ok("informa os dias do plano", /guarda 30 dias de histórico/.test(textoHistorico(rows, "A", { agora: AGORA, diasDoPlano: 30 })!));

if (fails) { console.log(`\n${fails} teste(s) falhados`); process.exit(1); }
