import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const createClient = async () => {
  const cookieStore = await cookies();

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase env vars não configuradas.");
  }

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      // Next + Supabase SSR: tipagem varia por versão, mantemos explícito.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      set(name: string, value: string, options: any) {
        cookieStore.set({ name, value, ...options });
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      remove(name: string, options: any) {
        cookieStore.set({ name, value: "", ...options });
      },
    },
  });
};
