// Guarda para rotas INTERNAS chamadas pela app com sessão (cookie) ou pela app
// mobile (Bearer JWT do Supabase). Devolve o utilizador ou uma resposta 401.
// Inclui rate-limit por utilizador (best-effort, em memória) para travar abuso
// dos proxies pagos (Etherscan, Moralis…).

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { rateLimit, clientIp } from "@/lib/utils/rateLimit";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export type RequireUserResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

export async function requireUser(
  req: Request,
  opts: { route: string; limit?: number; windowMs?: number } ,
): Promise<RequireUserResult> {
  let userId: string | null = null;
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
    });
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch { /* sem cookie */ }

  if (!userId) {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (token) {
      try {
        const client = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
        const { data } = await client.auth.getUser(token);
        userId = data.user?.id ?? null;
      } catch { /* inválido */ }
    }
  }

  if (!userId) {
    return { ok: false, response: NextResponse.json({ error: "unauthenticated", message: "Sessão necessária." }, { status: 401 }) };
  }

  const limit = opts.limit ?? 60;
  const windowMs = opts.windowMs ?? 60_000;
  const key = `${opts.route}:${userId}:${clientIp(req)}`;
  if (!rateLimit(key, limit, windowMs)) {
    const res = NextResponse.json({ error: "rate_limited", message: `Demasiados pedidos (${limit}/min).` }, { status: 429 });
    res.headers.set("Retry-After", String(Math.ceil(windowMs / 1000)));
    return { ok: false, response: res };
  }
  return { ok: true, userId };
}
