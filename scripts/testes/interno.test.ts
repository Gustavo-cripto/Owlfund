// Marca de visita interna (cookie cfa-interno=1): só "1" exato conta.
import { eInterno } from "@/lib/analytics/interno";

let fails = 0;
const ok = (n: string, c: boolean) => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}`); };

ok("sem cookies", !eInterno(""));
ok("null", !eInterno(null));
ok("só a marca", eInterno("cfa-interno=1"));
ok("no meio de outros", eInterno("a=b; cfa-interno=1; c=d"));
ok("no fim", eInterno("a=b; cfa-interno=1"));
ok("desligada (vazia)", !eInterno("cfa-interno="));
ok("outro valor", !eInterno("cfa-interno=10"));
ok("nome parecido", !eInterno("xcfa-interno=1"));

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
