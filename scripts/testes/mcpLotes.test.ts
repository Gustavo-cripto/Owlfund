// Um pedido ao MCP não pode correr mais do que uma ferramenta (auditoria 6 nov 2026).
import { loteComDemasiadasFerramentas as f } from "@/lib/api/mcpLotes";

let fails = 0;
const eq = (n: string, got: boolean, want: boolean) => { const ok = got === want; if (!ok) fails++; console.log(`${ok ? "✅" : "❌"} ${n}: ${got}`); };
const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "global" } };
const lista = { jsonrpc: "2.0", id: 2, method: "tools/list" };

eq("uma mensagem solta", f(call), false);
eq("corpo inválido", f(null), false);
eq("lote vazio", f([]), false);
eq("lote com uma ferramenta", f([call]), false);
eq("descoberta em lote", f([lista, lista, lista]), false);
eq("uma ferramenta + descoberta", f([lista, call]), false);
eq("duas ferramentas", f([call, call]), true);
eq("cem ferramentas", f(Array(100).fill(call)), true);
eq("com lixo pelo meio", f([null, call, 3, call]), true);

if (fails) { console.log(`\n${fails} falha(s)`); process.exit(1); }
console.log("TODOS OK");
