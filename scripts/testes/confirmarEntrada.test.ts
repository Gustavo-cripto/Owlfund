// O POST que gasta o link do email tem de vir de uma página do próprio site.
import { eDoProprioSite } from "@/lib/auth/proprioSite";

let fails = 0;
const ok = (n: string, c: boolean) => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}`); };
const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });
const O = "https://chainfolioai.com";

ok("formulário do próprio site", eDoProprioSite(h({ "sec-fetch-site": "same-origin", origin: O }), O));
ok("só Origin igual (browser antigo)", eDoProprioSite(h({ origin: O }), O));
ok("outro site", !eDoProprioSite(h({ "sec-fetch-site": "cross-site", origin: "https://mau.example" }), O));
ok("Origin diferente", !eDoProprioSite(h({ origin: "https://mau.example" }), O));
ok("subdomínio não é o próprio site", !eDoProprioSite(h({ "sec-fetch-site": "same-site", origin: "https://x.chainfolioai.com" }), O));
ok("sem cabeçalhos (curl, robô) não passa", !eDoProprioSite(h({}), O));

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
