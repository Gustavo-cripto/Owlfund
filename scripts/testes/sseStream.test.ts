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
