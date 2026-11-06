// Um pedido ao MCP conta uma vez no limite de 60/min, mas o SDK aceita lotes
// JSON-RPC de até 100 mensagens: um pedido podia correr 100 ferramentas
// (auditoria 6 nov 2026, reproduzido em local). Os lotes saíram do protocolo em
// 2025-06-18, por isso nenhum cliente atual precisa de mais do que uma ferramenta
// por pedido. A descoberta (initialize, tools/list) continua a poder ir em lote.
export function loteComDemasiadasFerramentas(corpo: unknown): boolean {
  if (!Array.isArray(corpo)) return false;
  let ferramentas = 0;
  for (const m of corpo) {
    if ((m as { method?: unknown } | null)?.method === "tools/call") ferramentas += 1;
    if (ferramentas > 1) return true;
  }
  return false;
}
