process.env.ALCHEMY_API_KEY = "chave-de-teste";
import { alchemyNftUrl } from "@/lib/providers/alchemy";
let fails = 0;
const ok = (n: string, c: boolean, extra = "") => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}${extra ? `: ${extra}` : ""}`); };

const u = alchemyNftUrl("0xAbC0000000000000000000000000000000000001", "eth", 50);
ok("usa o dominio da rede certa", u.startsWith("https://eth-mainnet.g.alchemy.com/nft/v3/chave-de-teste/getNFTsForOwner?"), u);
// 403 no plano gratuito — foi o que punha "0 itens" a toda a gente (24 set 2026).
ok("nunca leva o filtro excludeFilters (pago)", !u.includes("excludeFilters"), u);
// 400 quando os parentesis vao codificados (%5B%5D).
ok("nao tem parentesis codificados", !u.includes("%5B") && !u.includes("%5D"), u);
ok("pede metadados e o tamanho de pagina", u.includes("withMetadata=true") && u.includes("pageSize=50"));
ok("rede base -> base-mainnet", alchemyNftUrl("0xAbC0000000000000000000000000000000000001", "base").includes("base-mainnet"));
if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
