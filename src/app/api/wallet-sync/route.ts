import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/response";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

async function getAuthUser() {
  // 1) Sessão por cookies (site).
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  if (data.user) return data.user;

  // 2) Bearer token (app mobile) — valida o JWT junto do Supabase.
  const h = await headers();
  const auth = h.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  try {
    const anon = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
    const { data: viaToken } = await anon.auth.getUser(token);
    return viaToken.user ?? null;
  } catch {
    return null;
  }
}

// GET — carrega config de carteiras do Supabase
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await admin
    .from("wallet_config")
    .select("data, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return internalError(error);
  return NextResponse.json(data ?? { data: null });
}

// POST — guarda config de carteiras no Supabase
export async function POST(req: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!serviceKey) return NextResponse.json({ error: "Service key not configured" }, { status: 503 });

  // Tecto de tamanho ANTES de desserializar: o corpo era aceite e gravado tal e
  // qual, sem limite nenhum, com a chave de servico. Um blob real de conta
  // Premium com dez portefolios anda na casa das dezenas de kB; 512 kB deixa
  // folga larga e fecha a porta a encher a tabela.
  const MAX_BYTES = 512 * 1024;
  const declarado = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declarado) && declarado > MAX_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const bruto = await req.text();
  if (bruto.length > MAX_BYTES) return NextResponse.json({ error: "Payload too large" }, { status: 413 });

  let body: { data?: unknown };
  try {
    body = JSON.parse(bruto) as { data?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Tem de ser um objeto: era aceite qualquer coisa que nao fosse falsy, por
  // isso uma string ou um numero ficavam gravados no lugar da configuracao.
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    return NextResponse.json({ error: "No data" }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { error } = await admin
    .from("wallet_config")
    .upsert({ user_id: user.id, data: body.data, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

  if (error) return internalError(error);
  return NextResponse.json({ ok: true });
}
