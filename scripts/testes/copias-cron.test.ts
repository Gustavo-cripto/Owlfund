import { semCopiasDoCron } from "@/lib/portfolio/copias";
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? "✅" : "❌"} ${name}: ${JSON.stringify(got)}${ok ? "" : ` (esperado ${JSON.stringify(want)})`}`);
};
const r = (dia: number, total: number, extra: Record<string, unknown> = {}) => ({ created_at: `2026-10-${String(dia).padStart(2, "0")}T12:00:00Z`, data: { _totalEur: total, _account: "a1", ...extra } });
const dias = (rows: { created_at: string }[]) => rows.map((x) => Number(x.created_at.slice(8, 10)));

// O caso da auditoria: medição a 9, cópias a 10, 11, 12 (sem _bench, mesmo valor), medição a 13.
const caso = [r(9, 576, { _bench: { btc: 1 } }), r(10, 576), r(11, 576), r(12, 576), r(13, 489.28, { _bench: { btc: 1 } })];
eq("cópias antigas saem", dias(semCopiasDoCron(caso)), [9, 13]);
eq("marca _copia sai mesmo com valor diferente", dias(semCopiasDoCron([r(1, 100, { _bench: {} }), r(2, 120, { _copia: true })])), [1]);
eq("medição real sem _bench mas valor novo fica", dias(semCopiasDoCron([r(1, 100), r(2, 101)])), [1, 2]);
eq("valor igual COM _bench (medição real) fica", dias(semCopiasDoCron([r(1, 100, { _bench: {} }), r(2, 100, { _bench: {} })])), [1, 2]);
eq("contas diferentes não se comparam", dias(semCopiasDoCron([r(1, 100), { ...r(2, 100), data: { _totalEur: 100, _account: "a2" } }])), [1, 2]);
eq("ordem original mantida (mais recente primeiro)", dias(semCopiasDoCron([...caso].reverse())), [13, 9]);
eq("lista vazia", semCopiasDoCron([]), []);
if (fails) { console.log(`❌ ${fails} falha(s)`); process.exit(1); }
