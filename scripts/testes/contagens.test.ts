// Contagens que o marketing mostra tem de vir do codigo, nunca escritas a mao.
import { API_ENDPOINTS, MCP_TOOLS, preencherContagens } from "@/lib/api/catalog";
import { EVM_NETWORKS, SUPPORTED_CHAINS } from "@/lib/wallets/evm";
let fails = 0;
const eq = (name: string, got: string | number, want: string | number) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${name}: ${got}${ok ? "" : ` (esperado ${want})`}`); };
eq("preenche {endpoints} e {tools}", preencherContagens("{endpoints} endpoints REST + {tools} ferramentas MCP"), `${API_ENDPOINTS.length} endpoints REST + ${MCP_TOOLS.length} ferramentas MCP`);
eq("placeholder repetido e preenchido as vezes todas", preencherContagens("{tools}/{tools}"), `${MCP_TOOLS.length}/${MCP_TOOLS.length}`);
eq("frase sem placeholders fica igual", preencherContagens("mesma chave"), "mesma chave");
eq("catalogo nao encolheu (endpoints ≥ 24)", API_ENDPOINTS.length >= 24 ? "ok" : String(API_ENDPOINTS.length), "ok");
eq("catalogo nao encolheu (ferramentas ≥ 23)", MCP_TOOLS.length >= 23 ? "ok" : String(MCP_TOOLS.length), "ok");
eq("blockchains = EVM + BTC + SOL + ADA", SUPPORTED_CHAINS, EVM_NETWORKS.length + 3);
eq("19 redes hoje (se mudar, rever cf_t3_b1 e lp_cmp_r2_c nas 4 linguas)", SUPPORTED_CHAINS, 19);
console.log(fails === 0 ? "\nTODOS OK" : `\n${fails} FALHA(S)`); process.exit(fails ? 1 : 0);
