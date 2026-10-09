// Limitador em memória: janela, limite e limpeza das chaves expiradas (auditoria 8 out 2026).
import { rateLimit, _tamanhoRateLimit } from "@/lib/utils/rateLimit";

let fails = 0;
const ok = (n: string, c: boolean) => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}`); };

ok("1.º pedido passa", rateLimit("t:a", 2, 60_000));
ok("2.º pedido passa", rateLimit("t:a", 2, 60_000));
ok("3.º pedido bloqueado", !rateLimit("t:a", 2, 60_000));
ok("outra chave não é afetada", rateLimit("t:b", 2, 60_000));

// Muitas chaves de janela já terminada: a limpeza tira-as.
for (let i = 0; i < 3000; i++) rateLimit(`exp:${i}`, 5, -1);
ok("chaves expiradas são limpas", _tamanhoRateLimit() < 1000);

// Teto: nunca passa de 10 000 chaves vivas.
for (let i = 0; i < 12_000; i++) rateLimit(`vivo:${i}`, 5, 60_000);
ok("teto de chaves respeitado", _tamanhoRateLimit() <= 10_000);

if (fails) { console.log(`\n❌ ${fails} falha(s) em rateLimit`); process.exit(1); }
