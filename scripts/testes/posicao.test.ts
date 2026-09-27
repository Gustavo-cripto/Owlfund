// Base do "PNL da posicao" partilhada por Painel e Portefolio (auditoria set 2026, lote A).
import { baseDaPosicao, daConta, diasDaJanela, inicioDaJanela, limiteDaJanela } from "@/lib/portfolio/posicao";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};

const DIA = 86_400_000;
const AGORA = Date.parse("2026-09-26T12:00:00Z");
const iso = (diasAtras: number) => new Date(AGORA - diasAtras * DIA).toISOString();
const linha = (diasAtras: number, data: Record<string, unknown>) => ({ created_at: iso(diasAtras), data });

// Janela por plano.
eq("Free 30 dias", diasDaJanela("free"), 30);
eq("Pro 365 dias", diasDaJanela("pro"), 365);
eq("Premium sem limite", diasDaJanela("premium"), null);
eq("inicio Free = ha 30 dias", inicioDaJanela("free", AGORA), iso(30));
eq("inicio Premium = epoch 0", inicioDaJanela("premium", AGORA), new Date(0).toISOString());
eq("limite de linhas Pro", limiteDaJanela("pro"), 365);
eq("limite de linhas Premium", limiteDaJanela("premium"), 3650);

// Conta: legado sem etiqueta conta para todas; etiqueta diferente fica de fora.
eq("sem etiqueta pertence a conta ativa", daConta({}, "a1"), true);
eq("etiqueta igual pertence", daConta({ _account: "a1" }, "a1"), true);
eq("etiqueta diferente nao pertence", daConta({ _account: "a2" }, "a1"), false);

// Base: o mais antigo COM _totalEur, da conta ativa.
const rows = [
  linha(0, { _totalEur: 1200, _account: "a1" }),
  linha(1, { _totalEur: 1100, _account: "a1" }),
  linha(2, { eth: [] }),                            // sem total (gravado por visita) — ignorado
  linha(3, { _totalEur: 5000, _account: "a2" }),     // outra conta — ignorado
  linha(5, { _totalEur: 1000, _account: "a1" }),
  linha(9, { _totalEur: 900 }),                      // legado sem etiqueta — conta
];
const base = baseDaPosicao(rows, "a1");
eq("mais antigo com total da conta ativa (legado incluido)", base?.total, 900);
eq("data desse snapshot", base?.createdAt, AGORA - 9 * DIA);
eq("na conta a2 o legado sem etiqueta tambem conta (e e o mais antigo)", baseDaPosicao(rows, "a2")?.total, 900);
eq("na conta a2 sem legado fica so o seu ponto", baseDaPosicao(rows.slice(0, 5), "a2")?.total, 5000);
eq("sem nenhum com total → null", baseDaPosicao([linha(0, { eth: [] }), linha(1, {})], "a1"), null);
eq("total zero nao serve de base", baseDaPosicao([linha(0, { _totalEur: 0 })], "a1"), null);
eq("ordem de chegada nao importa", baseDaPosicao([rows[0], rows[5], rows[4]], "a1")?.total, 900);

// Anomalias: um snapshot 4x fora da mediana nao pode ser a base.
const comAnomalia = [
  linha(0, { _totalEur: 1000 }), linha(1, { _totalEur: 1050 }), linha(2, { _totalEur: 980 }),
  linha(3, { _totalEur: 1020 }), linha(10, { _totalEur: 161_546 }), // saldo lido como euros
];
eq("anomalia 4x acima da mediana fica de fora", baseDaPosicao(comAnomalia, "x")?.total, 1020);
eq("com menos de 4 pontos nao ha filtro", baseDaPosicao([linha(0, { _totalEur: 10 }), linha(1, { _totalEur: 1000 })], "x")?.total, 1000);

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("\nTODOS OK");
