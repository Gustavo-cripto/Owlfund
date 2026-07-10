import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  // Segredo obrigatório via env var (fail-closed): sem SETUP_DB_SECRET a rota fica bloqueada.
  const expected = (process.env.SETUP_DB_SECRET ?? "").trim();
  // Preferir o cabeçalho Authorization (não fica em logs de URL); manter a query
  // string por compatibilidade.
  const authHeader = request.headers.get("authorization") ?? "";
  const headerSecret = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const querySecret = new URL(request.url).searchParams.get("secret") ?? "";
  const provided = headerSecret || querySecret;
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: "Env vars em falta" }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Criar tabelas usando inserts que provocam erros úteis para diagnóstico
  // e usando upsert para verificar se as tabelas existem
  const steps: { step: string; ok: boolean; error?: string }[] = [];

  // 1. Criar tabela profiles via SQL usando pg_catalog trick
  // Supabase permite chamar funções SQL via rpc se existirem
  // Aqui usamos uma abordagem alternativa: tentar criar via upsert (se falhar = não existe)
  
  // Verificar se profiles existe
  const { error: profilesCheck } = await supabase.from("profiles").select("id").limit(1);
  if (profilesCheck?.code === "42P01") {
    // Tabela não existe - tentar criar via Supabase SQL API
    const res = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "POST", 
      headers: {
        "apikey": serviceKey,
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      }
    });
    steps.push({ step: "profiles_check", ok: false, error: "Tabela profiles não existe. Cria manualmente no Supabase SQL Editor." });
  } else {
    steps.push({ step: "profiles_exists", ok: true });
  }

  // Verificar se subscriptions existe
  const { error: subsCheck } = await supabase.from("subscriptions").select("id").limit(1);
  if (subsCheck?.code === "42P01") {
    steps.push({ step: "subscriptions_check", ok: false, error: "Tabela subscriptions não existe." });
  } else {
    steps.push({ step: "subscriptions_exists", ok: true });
  }

  // Verificar se news_briefing_schedule existe
  const { error: newsCheck } = await supabase.from("news_briefing_schedule").select("user_id").limit(1);
  steps.push({ 
    step: "news_briefing_schedule", 
    ok: !newsCheck || newsCheck.code !== "42P01",
    error: newsCheck?.code === "42P01" ? "Não existe" : undefined
  });

  return NextResponse.json({ steps });
}
