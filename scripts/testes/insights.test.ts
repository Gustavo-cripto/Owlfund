import { metricas, seriePontos, variacoes } from "@/lib/api/pnlMath";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = typeof got === "number" && typeof want === "number" ? Math.abs(got - want) < 1e-9 : JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};

const DIA = 86_400_000;
const AGORA = Date.parse("2026-09-18T12:00:00Z");
const iso = (diasAtras: number) => new Date(AGORA - diasAtras * DIA).toISOString();
const linha = (diasAtras: number, total: number | null) => ({ created_at: iso(diasAtras), data: total == null ? {} : { _totalEur: total } });

// Série: só entram snapshots com o total gravado na altura.
const serie = seriePontos([linha(0, 1100), linha(1, 1000), linha(7, 900), linha(40, 800), linha(3, null)]);
eq("ignora snapshots sem total gravado", serie.length, 4);
eq("fica por ordem cronológica", serie.map((p) => p.total), [800, 900, 1000, 1100]);
eq("sem total, sem ponto", seriePontos([linha(0, null)]).length, 0);
eq("total zero ou negativo não conta", seriePontos([linha(0, 0), linha(1, -5)]).length, 0);

const c = variacoes(serie, AGORA);
const get = (p: string) => c.find((x) => x.period === p)!;
eq("24h: 1100 − 1000", get("24h").eur, 100);
eq("24h em %", Math.round(get("24h").pct!), 10);
eq("7d: 1100 − 900", get("7d").eur, 200);
eq("30d usa o snapshot de há 40 dias", get("30d").eur, 300);
eq("desde o início", get("all").eur, 300);

// Sem histórico suficiente, o período fica a null em vez de inventar uma base.
const curta = seriePontos([linha(0, 500), linha(1, 480)]);
const c2 = variacoes(curta, AGORA);
eq("sem snapshot com 7 dias → null", c2.find((x) => x.period === "7d")!.eur, null);
eq("…e sem data de partida", c2.find((x) => x.period === "7d")!.fromAt, null);
eq("24h continua a dar", c2.find((x) => x.period === "24h")!.eur, 20);

// Um snapshot só: não há com que comparar.
const uma = variacoes(seriePontos([linha(0, 700)]), AGORA);
eq("um snapshot: tudo a null", uma.every((x) => x.eur === null), true);

// Anomalias (4× acima/abaixo da mediana) não podem entrar no cálculo.
const comLixo = seriePontos([linha(0, 1000), linha(1, 1010), linha(2, 990), linha(3, 161546), linha(4, 1005)]);
eq("snapshot absurdo é descartado", comLixo.some((p) => p.total === 161546), false);
eq("os reais ficam", comLixo.length, 4);


// ── Métricas ──
const serieM = seriePontos([linha(120, 1000), linha(90, 1200), linha(60, 900), linha(30, 1400), linha(0, 1500)]);
const m = metricas(serieM, AGORA)!;
eq("ROI do período", Math.round(m.roi), 50);
eq("CAGR existe acima de 90 dias", m.cagr !== null, true);
eq("queda máxima é negativa", m.maxDrawdown < 0, true);
eq("dias contados", m.days, 120);
eq("capturas usadas", m.snapshotsUsed, 5);
eq("sem pico recente, drawdown atual = 0", Math.round(m.currentDrawdown), 0);

// Menos de 90 dias: o CAGR não se inventa (anualizar períodos curtos dá números absurdos).
const curta2 = metricas(seriePontos([linha(30, 1000), linha(0, 1600)]), AGORA)!;
eq("CAGR a null abaixo de 90 dias", curta2.cagr, null);
eq("ROI continua a existir", Math.round(curta2.roi), 60);

// Uma captura só, ou nenhuma: não há métricas.
eq("uma captura → sem métricas", metricas(seriePontos([linha(0, 100)]), AGORA), null);
eq("nada → sem métricas", metricas([], AGORA), null);

// Duas capturas no mesmo dia contam como uma (senão o retorno de 0 % estragava tudo).
eq("mesmo dia conta uma vez", metricas(seriePontos([linha(0, 100), linha(0.1, 100)]), AGORA), null);

console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
