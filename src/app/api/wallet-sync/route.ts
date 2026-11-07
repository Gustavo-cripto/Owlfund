import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/response";
import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { blobSemRelacao } from "@/lib/portfolios/guardaNuvem";
import { falta2fa, falta2faNaSessao } from "@/lib/auth/nivelSessao";
import { resposta2fa } from "@/lib/auth/resposta2fa";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const PRECISA_2FA = "precisa-2fa" as const;

async function getAuthUser() {
  // 1) Sessão por cookies (site).
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: { get: (name) => cookieStore.get(name)?.value, set: () => {}, remove: () => {} },
  });
  const { data } = await supabase.auth.getUser();
  if (data.user) return (await falta2faNaSessao(supabase, data.user)) ? PRECISA_2FA : data.user;

  // 2) Bearer token (app mobile) — valida o JWT junto do Supabase.
  const h = await headers();
  const auth = h.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  try {
    const anon = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } });
    const { data: viaToken } = await anon.auth.getUser(token);
    if (viaToken.user && falta2fa(viaToken.user, token)) return PRECISA_2FA;
    return viaToken.user ?? null;
  } catch {
    return null;
  }
}

// GET — carrega config de carteiras do Supabase
export async function GET() {
  const user = await getAuthUser();
  if (user === PRECISA_2FA) return resposta2fa();
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
  if (user === PRECISA_2FA) return resposta2fa();
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

  let body: { data?: unknown; leuNuvem?: unknown };
  try {
    body = JSON.parse(bruto) as { data?: unknown; leuNuvem?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  // Tem de ser um objeto: era aceite qualquer coisa que nao fosse falsy, por
  // isso uma string ou um numero ficavam gravados no lugar da configuracao.
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) {
    return NextResponse.json({ error: "No data" }, { status: 400 });
  }

  // Pre-visualizacoes da Vercel usam a MESMA base de dados mas nao tem as
  // chaves dos fornecedores (saldos e tokens falham) e correm noutra origem
  // (localStorage vazio): gravar dali punha zeros e contas vazias na conta
  // real. A pre-visualizacao le, mas nao escreve (auditoria 28 set 2026).
  if (process.env.VERCEL_ENV === "preview") {
    return NextResponse.json({ ok: true, skipped: "preview" });
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  // O site lê a nuvem antes de enviar e diz que leu. Quem não o diz (separador
  // com código antigo, app móvel) não pode substituir uma conta com dados por
  // outra sem nada em comum (auditoria 6 nov 2026).
  if (body.leuNuvem !== true) {
    const { data: guardado, error: erroLeitura } = await admin
      .from("wallet_config")
      .select("data")
      .eq("user_id", user.id)
      .maybeSingle();
    if (erroLeitura) return internalError(erroLeitura);
    if (blobSemRelacao(guardado?.data, body.data)) {
      return NextResponse.json({ error: "Stale device: read the cloud first" }, { status: 409 });
    }
  }
  const { error } = await admin
    .from("wallet_config")
    .upsert({ user_id: user.id, data: body.data, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

  if (error) return internalError(error);
  return NextResponse.json({ ok: true });
}
