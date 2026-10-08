// Histórico de conversa vindo do browser, tornado seguro para enviar ao modelo
// (auditoria 8 out 2026). Antes cada bot fazia isto à sua maneira e o Chat de
// Mercado passava o papel do cliente tal e qual ("system" e "tool" incluídos).
// Puro, para testes (scripts/testes/historicoSeguro.test.ts).

export type MensagemSegura = { role: "user" | "assistant"; content: string };

/**
 * Só papéis user/assistant, conteúdo em texto, as últimas `max` mensagens,
 * cada uma cortada a `maxChars` e o total a `maxTotal` (corta das mais antigas).
 * Entradas que não sejam objetos com conteúdo em texto são descartadas.
 */
export function historicoSeguro(
  bruto: unknown,
  opts: { max?: number; maxChars?: number; maxTotal?: number } = {},
): MensagemSegura[] {
  const max = opts.max ?? 12;
  const maxChars = opts.maxChars ?? 2500;
  const maxTotal = opts.maxTotal ?? 16000;
  if (!Array.isArray(bruto)) return [];
  const limpas: MensagemSegura[] = [];
  for (const m of bruto) {
    if (!m || typeof m !== "object") continue;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (typeof content !== "string" || !content.trim()) continue;
    limpas.push({ role: role === "assistant" ? "assistant" : "user", content: content.slice(0, maxChars) });
  }
  const ultimas = limpas.slice(-max);
  let total = ultimas.reduce((s, m) => s + m.content.length, 0);
  while (ultimas.length > 1 && total > maxTotal) total -= ultimas.shift()!.content.length;
  return ultimas;
}
