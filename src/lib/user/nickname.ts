// Nickname do utilizador — usado no Dashboard e enviado aos chats para a IA
// tratar o utilizador pelo nome. Fonte de verdade: user_metadata do Supabase
// (cross-device, sem migração de schema); cache em localStorage para leitura
// instantânea no cliente.

const KEY = "owlfund.nickname";

export function loadNickname(): string {
  if (typeof window === "undefined") return "";
  try {
    return (localStorage.getItem(KEY) ?? "").trim();
  } catch {
    return "";
  }
}

export function saveNickname(name: string): void {
  if (typeof window === "undefined") return;
  try {
    const v = name.trim().slice(0, 40);
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

/** Extrai o nickname do user_metadata do Supabase (se existir). */
export function nicknameFromMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "";
  const v = (metadata as Record<string, unknown>).nickname;
  return typeof v === "string" ? v.trim() : "";
}
