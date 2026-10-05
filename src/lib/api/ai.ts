// Chamada ao LLM partilhada pela API/MCP: a mesma cadeia Groq → Gemini →
// OpenAI → xAI de src/lib/ai/groq.ts (antes tinha aqui uma cópia sem Gemini).
import { generateAiChat, type ChatMessage } from "@/lib/ai/groq";

export type { ChatMessage };

export async function askAI(messages: ChatMessage[]): Promise<string | null> {
  try {
    return await generateAiChat(messages, { maxTokens: 500, temperature: 0.5 });
  } catch (e) {
    console.error("[api/ai]", e instanceof Error ? e.message : e);
    return null;
  }
}
