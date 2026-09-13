import type { SupabaseClient } from "@supabase/supabase-js";
import { LANGS } from "@/lib/i18n/routes";
import type { Lang } from "@/lib/i18n/translations";

// A lingua de um cliente, para tudo o que lhe enviamos (email, avisos).
//
// Nao ha coluna nova: como o nickname, vive em `user_metadata.lang` — o site
// grava-a sempre que a pessoa escolhe/usa uma lingua com sessao aberta. Para
// quem ainda nao voltou desde que isto existe, vale a lingua com que se
// inscreveu no beta (`beta_signups.lang`). So sem nada e que cai em portugues.
//
// Ordem: metadata (escolha mais recente) → inscricao no beta → "pt".

export function normLang(x: unknown): Lang | null {
  return typeof x === "string" && (LANGS as readonly string[]).includes(x) ? (x as Lang) : null;
}

export function langFromMetadata(metadata: unknown): Lang | null {
  if (!metadata || typeof metadata !== "object") return null;
  return normLang((metadata as Record<string, unknown>).lang);
}

/** Lingua com que cada email se inscreveu no beta (best-effort; tabela opcional). */
export async function signupLangByEmail(admin: SupabaseClient): Promise<Map<string, Lang>> {
  const map = new Map<string, Lang>();
  try {
    const { data } = await admin.from("beta_signups").select("email, lang");
    for (const r of data ?? []) {
      const l = normLang(r.lang);
      if (r.email && l) map.set(String(r.email).toLowerCase(), l);
    }
  } catch { /* sem tabela: fica o resto da cadeia */ }
  return map;
}

export function resolveLang(...candidates: Array<Lang | string | null | undefined>): Lang {
  for (const c of candidates) { const l = normLang(c); if (l) return l; }
  return "pt";
}
