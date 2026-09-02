// Chamada ao LLM com fallback Groq → OpenAI → xAI, partilhada pela API/MCP.
// Groq (free tier) primeiro; só cai para os pagos se o Groq falhar.

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type Choices = { choices?: Array<{ message?: { content?: string } }> };

async function call(url: string, key: string, model: string, messages: ChatMessage[], timeout: number): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0.5, max_tokens: 500, messages }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return null;
    const data = await res.json() as Choices;
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch { return null; }
}

export async function askAI(messages: ChatMessage[]): Promise<string | null> {
  const groqKey = (process.env.GROQ_API_KEY ?? "").trim();
  if (groqKey) {
    const model = (process.env.GROQ_MODEL ?? "").trim() || "llama-3.3-70b-versatile";
    const r = await call("https://api.groq.com/openai/v1/chat/completions", groqKey, model, messages, 12000);
    if (r) return r;
  }

  const openaiKey = (process.env.OPENAI_API_KEY ?? "").trim();
  if (openaiKey) {
    const r = await call("https://api.openai.com/v1/chat/completions", openaiKey, process.env.OPENAI_MODEL ?? "gpt-4o-mini", messages, 15000);
    if (r) return r;
  }

  const xaiKey = (process.env.XAI_API_KEY ?? "").trim();
  if (xaiKey) {
    const r = await call("https://api.x.ai/v1/chat/completions", xaiKey, "grok-4-fast-non-reasoning", messages, 15000);
    if (r) return r;
  }

  return null;
}
