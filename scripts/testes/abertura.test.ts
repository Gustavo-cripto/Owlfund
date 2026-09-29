// Só páginas abertas contam como visita (não prefetches nem navegações RSC).
import { eAberturaDePagina } from "@/lib/analytics/abertura";

let fails = 0;
const ok = (n: string, c: boolean) => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}`); };
const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

ok("browser a abrir página", eAberturaDePagina(h({ "sec-fetch-dest": "document", accept: "text/html,application/xhtml+xml" })));
ok("prefetch/RSC do Next (fetch)", !eAberturaDePagina(h({ "sec-fetch-dest": "empty", accept: "*/*" })));
ok("fetch mesmo pedindo html", !eAberturaDePagina(h({ "sec-fetch-dest": "empty", accept: "text/html" })));
ok("iframe não conta", !eAberturaDePagina(h({ "sec-fetch-dest": "iframe", accept: "text/html" })));
ok("robô sem Sec-Fetch que pede HTML conta", eAberturaDePagina(h({ accept: "text/html,*/*" })));
ok("curl por omissão não conta", !eAberturaDePagina(h({ accept: "*/*" })));
ok("sem cabeçalhos não conta", !eAberturaDePagina(h({})));

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
