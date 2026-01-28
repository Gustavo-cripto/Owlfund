import { createClient } from "@supabase/supabase-js";

export const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  // Não lançar erro no import (para não quebrar o build). Validamos quando usado.
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin env vars não configuradas.");
  }
  if (!/^https?:\/\//i.test(supabaseUrl)) {
    throw new Error("Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
};
