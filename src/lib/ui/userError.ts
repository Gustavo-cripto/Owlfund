// Transforma um erro apanhado num texto que se pode mostrar a uma pessoa.
//
// O padrao `err instanceof Error ? err.message : t("…")` punha no ecra coisas
// como "Failed to fetch", "Load failed" (Safari), "Unexpected token < in JSON"
// ou "HTTP 503" — em ingles e sem dizer o que fazer. Aqui: mensagens tecnicas
// caem para o texto traduzido de reserva; as que ja sao para pessoas (vindas
// do nosso /api com apiMsg, ou lancadas pelas libs de carteiras) passam.

const TECHNICAL = /\b(failed to fetch|load failed|networkerror|network request failed|fetch failed|unexpected token|unexpected end of json|json\.parse|is not valid json|aborted|abort(?:error)?|timed? ?out|typeerror|referenceerror|econn|enotfound|socket hang up|http \d{3}|status(?: code)? \d{3}|\b5\d{2}\b)/i;

const REJECTED = /user (?:rejected|denied|cancel)|rejected the request|request rejected|user closed modal|cancelled by user|\b4001\b/i;

export type UserErrorOpts = {
  /** Texto para quando a pessoa cancelou na propria carteira (MetaMask 4001, Phantom…). */
  rejected?: string;
  /** Textos traduzidos por `code` do erro (ver walletError); "{p}" vira o nome do fornecedor. */
  codes?: Record<string, string>;
};

export function userError(err: unknown, fallback: string, opts: UserErrorOpts = {}): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  const msg = raw.trim();
  if (opts.codes && err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    const provider = (err as { provider?: unknown }).provider;
    if (typeof code === "string" && opts.codes[code]) {
      return opts.codes[code].replace("{p}", typeof provider === "string" && provider ? provider : "");
    }
  }
  if (!msg) return fallback;
  if (REJECTED.test(msg)) return opts.rejected ?? fallback;
  if (TECHNICAL.test(msg)) return fallback;
  // Mensagens gigantes (stack traces, HTML de erro) nunca sao para pessoas.
  if (msg.length > 200 || /<\/?[a-z][\s\S]*>/i.test(msg)) return fallback;
  return msg;
}
