import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

const ALLOWED_NEXT_PATHS = ["/dashboard", "/wallets", "/portfolio", "/mercado"];

function getAllowedRedirect(stateParam: string | null, origin: string): string {
  if (!stateParam || !stateParam.startsWith("next:")) {
    return `${origin}/dashboard`;
  }
  const path = stateParam.slice(5);
  const allowed = ALLOWED_NEXT_PATHS.some(
    (p) => path === p || path.startsWith(`${p}/`)
  );
  return allowed ? `${origin}${path}` : `${origin}/dashboard`;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const redirectTo = getAllowedRedirect(state, origin);
  return NextResponse.redirect(redirectTo);
}
