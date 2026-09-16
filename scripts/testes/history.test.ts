import { combineSeries, ema, sma, type Bar } from "@/lib/portfolio/history";
let fails = 0;
const eq = (name: string, got: number, want: number) => { const ok = Math.abs(got - want) < 1e-9; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`); };
const B = (t: number, c: number, spread = 0): Bar => ({ t, o: c - spread, h: c + spread, l: c - spread * 2, c });
// dois ativos alinhados + constante
let r = combineSeries({ BTC: [B(1, 100, 1), B(2, 110, 1)], ETH: [B(1, 10), B(2, 12)] }, { BTC: 0.5, ETH: 2 }, {}, 1000);
eq("nº de pontos", r.length, 2);
eq("fecho t=1: 1000 + 50 + 20", r[0].c, 1070);
eq("fecho t=2: 1000 + 55 + 24", r[1].c, 1079);
eq("máximo t=1 inclui spread só do BTC: 1000 + 0.5×101 + 20", r[0].h, 1070.5);
// ativo sem vela num instante fica parado no último fecho
r = combineSeries({ BTC: [B(1, 100), B(2, 110), B(3, 120)], ETH: [B(1, 10), B(3, 30)] }, { BTC: 1, ETH: 1 }, {}, 0);
eq("t=2 usa último fecho do ETH (10): 110 + 10", r[1].c, 120);
eq("t=3: 120 + 30", r[2].c, 150);
// escala corrige a base para o preço da app
r = combineSeries({ BTC: [B(1, 100), B(2, 200)] }, { BTC: 1 }, { BTC: 1.02 }, 0);
eq("escala 1.02 aplicada", r[1].c, 204);
// quantidade zero ou série vazia → nada
eq("sem quantidades → vazio", combineSeries({ BTC: [B(1, 1)] }, { BTC: 0 }, {}, 5).length, 0);
// SMA
const s = sma([B(1, 1), B(2, 2), B(3, 3), B(4, 4)], 2);
eq("sma(2) no 1º ponto é null", s[0].v === null ? 1 : 0, 1);
eq("sma(2) no 4º ponto = 3.5", s[3].v ?? -1, 3.5);
const e = ema([B(1, 10), B(2, 10), B(3, 10), B(4, 20)], 3);
eq("ema(3): null antes de 3 pontos", e[1].v === null ? 1 : 0, 1);
eq("ema(3) no 3º ponto = SMA = 10", e[2].v ?? -1, 10);
eq("ema(3) no 4º = 20×0.5 + 10×0.5 = 15", e[3].v ?? -1, 15);
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
