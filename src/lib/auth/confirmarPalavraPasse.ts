import { createClient } from "@supabase/supabase-js";

export type Confirmacao = "certa" | "errada" | "indisponivel";

/**
 * Confirma a palavra-passe no servidor, com um cliente descartável. No browser, o
 * signInWithPassword trocava a sessão por uma aal1, e quem tem 2FA ficava bloqueado
 * logo a seguir. Assim a sessão da pessoa não muda, e quem roubou a sessão não passa
 * só por chamar a rota diretamente.
 */
export async function confirmarPalavraPasse(email: string | null | undefined, password: unknown, captchaToken?: unknown): Promise<Confirmacao> {
  if (!email || typeof password !== "string" || !password) return "errada";
  const cliente = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { error } = await cliente.auth.signInWithPassword({
      email,
      password,
      options: typeof captchaToken === "string" && captchaToken ? { captchaToken } : undefined,
    });
    if (error) {
      // Só isto é "errada". Um limite ou uma falha do Supabase não pode dizer à
      // pessoa que se enganou na palavra-passe.
      return error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message) ? "errada" : "indisponivel";
    }
    // Termina só esta sessão descartável; a da pessoa fica como estava.
    await cliente.auth.signOut({ scope: "local" }).catch(() => undefined);
    return "certa";
  } catch (e) {
    console.error("[confirmar-palavra-passe]", e instanceof Error ? e.message : e);
    return "indisponivel";
  }
}
