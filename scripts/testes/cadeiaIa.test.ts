// Cadeia de fornecedores de IA (generateAiChat) com um fetch simulado: ordem,
// saltos por tipo de erro, prazo e teto de tentativas (auditoria dos bots, 8 out 2026).
import { generateAiChat, AiError } from "@/lib/ai/groq";

let fails = 0;
const ok = (n: string, c: boolean) => { if (!c) fails++; console.log(`${c ? "✅" : "❌"} ${n}`); };

type Chamada = { fornecedor: string; modelo: string; raciocinio: boolean };
type Resposta = { status: number; corpo?: string; conteudo?: string; motivo?: string };

const fornecedor = (url: string) => url.includes("groq") ? "groq" : url.includes("googleapis") ? "gemini" : url.includes("openai.com") ? "openai" : url.includes("x.ai") ? "xai" : "?";

/** Corre generateAiChat com respostas pela ordem dada; devolve as chamadas feitas e o resultado. */
async function correr(respostas: Resposta[], opts: { tokensEntrada?: number; prazo?: number } = {}) {
  const chamadas: Chamada[] = [];
  let i = 0;
  globalThis.fetch = (async (url: string, init: { body: string }) => {
    const b = JSON.parse(init.body) as { model: string; reasoning_effort?: string };
    chamadas.push({ fornecedor: fornecedor(String(url)), modelo: b.model, raciocinio: b.reasoning_effort != null });
    const r = respostas[i++] ?? { status: 503 };
    if (r.status !== 200) return new Response(r.corpo ?? "erro", { status: r.status });
    return new Response(JSON.stringify({ choices: [{ message: { content: r.conteudo ?? "" }, finish_reason: r.motivo ?? "stop" }] }), { status: 200 });
  }) as unknown as typeof fetch;
  try {
    const texto = await generateAiChat([{ role: "user", content: "olá" }], { maxTokens: 200, temperature: 0.3, ...opts });
    return { chamadas, texto, erro: null as AiError | null };
  } catch (e) {
    return { chamadas, texto: null, erro: e as AiError };
  }
}

void (async () => {
  // Chaves de TESTE (não são segredos): só ativam os ramos da cadeia.
  process.env.GROQ_API_KEY = "teste"; process.env.GEMINI_API_KEY = "teste";
  process.env.OPENAI_API_KEY = "teste"; process.env.XAI_API_KEY = "teste";
  delete process.env.GROQ_MODEL; delete process.env.GEMINI_MODEL; delete process.env.GROQ_TOKEN_LIMIT;
  const erroOriginal = console.error, avisoOriginal = console.warn;
  console.error = () => {}; console.warn = () => {};
  const fetchOriginal = globalThis.fetch;

  let r = await correr([{ status: 404, corpo: "model_not_found" }, { status: 200, conteudo: "resposta" }]);
  ok("modelo Groq inexistente → próximo modelo Groq", r.texto === "resposta" && r.chamadas.map((c) => c.fornecedor).join() === "groq,groq");

  ok("gpt-oss do Groq pede raciocínio baixo", r.chamadas[0].modelo.startsWith("openai/gpt-oss") && r.chamadas[0].raciocinio);

  r = await correr([{ status: 400, corpo: "invalid request: bad messages" }, { status: 200, conteudo: "gem" }]);
  ok("400 de pedido inválido no Groq → passa logo ao Gemini", r.texto === "gem" && r.chamadas.map((c) => c.fornecedor).join() === "groq,gemini");

  r = await correr([{ status: 429 }, { status: 200, conteudo: "" }, { status: 200, conteudo: "sem raciocínio" }]);
  ok("Gemini vazio → repete o mesmo modelo sem reasoning_effort", r.texto === "sem raciocínio" && r.chamadas[1].raciocinio && !r.chamadas[2].raciocinio && r.chamadas[1].modelo === r.chamadas[2].modelo);

  r = await correr([{ status: 429 }, { status: 401 }, { status: 200, conteudo: "openai" }]);
  ok("Gemini 401 → desiste do Gemini e passa ao OpenAI", r.texto === "openai" && r.chamadas.map((c) => c.fornecedor).join() === "groq,gemini,openai");

  r = await correr([{ status: 200, conteudo: "meia", motivo: "length" }, { status: 503 }, { status: 503 }, { status: 503 }, { status: 503 }, { status: 503 }]);
  ok("resposta cortada guardada e devolvida se ninguém fizer melhor", r.texto === "meia");

  r = await correr([{ status: 200, conteudo: "meia", motivo: "length" }, { status: 200, conteudo: "inteira" }]);
  ok("resposta cortada → o fornecedor seguinte dá a inteira", r.texto === "inteira");

  r = await correr([], { tokensEntrada: 9000 });
  ok("pedido acima do teto do Groq → começa no Gemini", r.chamadas[0]?.fornecedor === "gemini");

  r = await correr(Array.from({ length: 20 }, () => ({ status: 503 })));
  ok("teto de 6 tentativas", r.chamadas.length === 6 && r.erro instanceof AiError);

  r = await correr([{ status: 200, conteudo: "x" }], { prazo: Date.now() + 1000 });
  ok("prazo quase esgotado → não chama ninguém e dá 504", r.chamadas.length === 0 && r.erro?.status === 504);

  process.env.GEMINI_API_KEY = ""; process.env.OPENAI_API_KEY = ""; process.env.XAI_API_KEY = "";
  r = await correr([{ status: 429 }, { status: 429 }, { status: 429 }]);
  ok("só Groq e todos 429 → AiError 429", r.erro?.status === 429);

  globalThis.fetch = fetchOriginal;
  console.error = erroOriginal; console.warn = avisoOriginal;
  if (fails) { console.log(`\n❌ ${fails} falha(s) em cadeiaIa`); process.exit(1); }
})();
