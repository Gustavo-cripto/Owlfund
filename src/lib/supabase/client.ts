import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const createClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    // During prerender/build on server, avoid crashing client pages.
    if (typeof window === "undefined") {
      return {} as ReturnType<typeof createBrowserClient>;
    }
    throw new Error("Supabase env vars não configuradas.");
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
};
