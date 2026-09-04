// Reserva de preço de fundador (Pro €9,99 / Premium €19, vitalício).
// Partilhado entre o webhook do Telegram e o painel admin.
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type FounderResult = { ok: boolean; error?: string; email?: string };

/** Marca um utilizador como fundador (idempotente). */
export async function setFounder(userId: string): Promise<FounderResult> {
  const admin = getSupabaseAdmin();
  let email = "";
  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    email = data.user?.email ?? "";
  } catch { /* ignore */ }
  if (!email) return { ok: false, error: "Utilizador não encontrado." };

  const { error } = await admin
    .from("founders")
    .upsert({ user_id: userId, email }, { onConflict: "user_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, email };
}

/** Remove a reserva de fundador. */
export async function unsetFounder(userId: string): Promise<FounderResult> {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from("founders").delete().eq("user_id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** true se o utilizador tem preço de fundador reservado. */
export async function isFounder(userId: string): Promise<boolean> {
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin.from("founders").select("user_id").eq("user_id", userId).maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}
