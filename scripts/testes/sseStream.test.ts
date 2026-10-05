import { sseParaTexto } from "@/lib/ai/groq";
let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => { if (!cond) fails++; console.log(`${cond ? "✅" : "❌"} ${name}${extra ? ` — ${extra}` : ""}`); };

async function correr(pedacos: string[]): Promise<string> {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) { for (const p of pedacos) c.enqueue(enc.encode(p)); c.close(); },
  });
  const reader = sseParaTexto(body).getReader();
  let out = "";
  for (;;) { const { done, value } = await reader.read(); if (done) break; out += value; }
  return out;
}

(async () => {
  const sse = (delta: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`;
  // Pedaços cortados a meio de linhas e de caracteres multibyte.
  const texto = sse("Olá ") + sse("mundo") + sse(" — €") + "data: [DONE]\n\n";
  const meio = Math.floor(texto.length / 2);
  ok("junta pedaços cortados a meio", (await correr([texto.slice(0, meio), texto.slice(meio)])) === "Olá mundo — €");
  ok("ignora keep-alive e linhas sem data", (await correr([": ping\n\n", "event: x\n", sse("a"), "\n", sse("b")])) === "ab");
  ok("delta nulo (fim de stream) não parte", (await correr(['data: {"choices":[{"delta":{"content":null}}]}\n\n', sse("ok")])) === "ok");
  ok("JSON inválido é ignorado", (await correr(["data: {nao e json\n\n", sse("z")])) === "z");
  if (fails) { console.log(`\n${fails} teste(s) falhados`); process.exit(1); }
})();

// ── Eventos com pedidos de ferramenta ──
import { sseParaEventos } from "@/lib/ai/groq";
(async () => {
  let f2 = 0;
  const ok2 = (name: string, cond: boolean) => { if (!cond) f2++; console.log(`${cond ? "✅" : "❌"} ${name}`); };
  const enc = new TextEncoder();
  const linhas = [
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"ler_seccao","arguments":""}}]}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"seccao\\":"}}]}}]}\n\n',
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\\"defi\\"}"}}]}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
    "data: [DONE]\n\n",
  ];
  const body = new ReadableStream<Uint8Array>({ start(c) { for (const l of linhas) c.enqueue(enc.encode(l)); c.close(); } });
  const reader = sseParaEventos(body).getReader();
  const eventos: unknown[] = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; eventos.push(value); }
  const tools = eventos.filter((e) => (e as { tipo: string }).tipo === "tool") as Array<{ index: number; id?: string; name?: string; args?: string }>;
  ok2("3 deltas de ferramenta + 1 de texto", tools.length === 3 && eventos.length === 4);
  ok2("id e nome no primeiro delta", tools[0].id === "call_1" && tools[0].name === "ler_seccao");
  ok2("argumentos juntam-se por ordem", tools.map((t) => t.args ?? "").join("") === '{"seccao":"defi"}');
  if (f2) { console.log(`\n${f2} teste(s) falhados`); process.exit(1); }
})();
