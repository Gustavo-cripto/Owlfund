import { NextResponse } from "next/server";

import { verifyAdminAuth } from "@/lib/api/admin-auth";
import { BUCKET } from "@/lib/backup/dump";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Lista as cópias de segurança e devolve um endereço temporário para
// descarregar uma. Existe porque uma cópia que não se consegue tirar de lá não
// é uma cópia — é uma esperança.
//
//   listar:      GET /api/v1/admin/backups
//   descarregar: GET /api/v1/admin/backups?file=2026-09-21.json.gz
//
// Protegido pelo ADMIN_STATS_TOKEN (falha fechado sem ele). O endereço de
// descarga dura uma hora e é assinado: o balde continua privado.
const VALIDADE_SEGUNDOS = 3600;

export async function GET(request: Request) {
  if (!verifyAdminAuth(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let admin: ReturnType<typeof getSupabaseAdmin>;
  try {
    admin = getSupabaseAdmin();
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const ficheiro = new URL(request.url).searchParams.get("file");

  if (ficheiro) {
    // Só nomes que a cópia gera. Sem isto, o parâmetro dava para pedir
    // qualquer caminho dentro do balde.
    if (!/^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(ficheiro)) {
      return NextResponse.json({ error: "bad_file" }, { status: 400 });
    }
    const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(ficheiro, VALIDADE_SEGUNDOS);
    if (error || !data) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ file: ficheiro, url: data.signedUrl, expiresInSeconds: VALIDADE_SEGUNDOS });
  }

  const { data, error } = await admin.storage.from(BUCKET).list(undefined, {
    limit: 100, sortBy: { column: "name", order: "desc" },
  });
  if (error) return NextResponse.json({ error: "list_failed" }, { status: 503 });

  const copias = (data ?? [])
    .filter((f) => f.name.endsWith(".json.gz"))
    .map((f) => ({
      file: f.name,
      date: f.name.slice(0, 10),
      kb: f.metadata?.size ? Math.round(Number(f.metadata.size) / 1024) : null,
      createdAt: f.created_at ?? null,
    }));

  return NextResponse.json({
    total: copias.length,
    backups: copias,
    hint: "Para descarregar: ?file=<nome>. O endereço devolvido dura 1 hora.",
    aviso: "As cópias vivem no mesmo projeto Supabase. Protegem contra erros e apagamentos, não contra perder o projeto.",
  });
}
