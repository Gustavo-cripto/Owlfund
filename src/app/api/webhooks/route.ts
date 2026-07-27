import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSessionUser, isUserPremium } from "@/lib/api/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bloqueia IPs privados/reservados para não permitir SSRF cego contra a rede
// interna (metadata cloud, localhost, RFC 1918/CGNAT). IP literal malformado →
// bloqueia por precaução. Não resolve DNS (defesa em profundidade, não garantia).
function isPrivateIpv4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;               // link-local / metadata
  if (a === 172 && b >= 16 && b <= 31) return true;      // RFC 1918
  if (a === 192 && b === 168) return true;               // RFC 1918
  if (a === 100 && b >= 64 && b <= 127) return true;     // CGNAT
  return false;
}

function isPrivateHost(host: string): boolean {
  if (host.includes(":")) {                              // IPv6 literal
    const h = host.replace(/^\[|\]$/g, "");
    if (h === "::1" || h === "::") return true;
    if (h.startsWith("fc") || h.startsWith("fd")) return true;  // unique local fc00::/7
    if (/^fe[89ab]/.test(h)) return true;                       // link-local fe80::/10
    const mapped = h.match(/(\d+\.\d+\.\d+\.\d+)$/);            // ::ffff:a.b.c.d
    return mapped ? isPrivateIpv4(mapped[1]) : false;
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return isPrivateIpv4(host);
  return false;
}

function isValidHttpsUrl(u: string): boolean {
  let url: URL;
  try {
    url = new URL(u);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (isPrivateHost(host)) return false;
  return true;
}

// GET — devolve a config do webhook do utilizador (com o segredo, para ele
// poder verificar a assinatura HMAC).
export async function GET() {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await isUserPremium(supabase, user.id))) return NextResponse.json({ error: "Requer Premium." }, { status: 403 });

  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("webhook_config")
    .select("url, secret, enabled, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({ webhook: data ?? null });
}

// POST — cria ou atualiza o webhook { url }. Gera um segredo na primeira vez.
export async function POST(req: NextRequest) {
  const { supabase, user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!(await isUserPremium(supabase, user.id))) return NextResponse.json({ error: "Requer Premium." }, { status: 403 });

  const body = await req.json().catch(() => ({})) as { url?: string; enabled?: boolean };
  const url = (body.url ?? "").trim();
  if (!isValidHttpsUrl(url)) {
    return NextResponse.json({ error: "URL inválido — tem de ser https://" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: existing } = await admin.from("webhook_config").select("secret").eq("user_id", user.id).maybeSingle();
  const secret = existing?.secret ?? `whsec_${randomBytes(24).toString("hex")}`;

  const { error } = await admin.from("webhook_config").upsert({
    user_id: user.id,
    url,
    secret,
    enabled: body.enabled ?? true,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (error) return NextResponse.json({ error: "Erro ao guardar." }, { status: 500 });
  return NextResponse.json({ webhook: { url, secret, enabled: body.enabled ?? true } });
}

// DELETE — remove o webhook.
export async function DELETE() {
  const { user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const admin = getSupabaseAdmin();
  await admin.from("webhook_config").delete().eq("user_id", user.id);
  return NextResponse.json({ deleted: true });
}
