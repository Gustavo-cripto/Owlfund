// Monitorização leve de erros do cliente. Recebe erros de JS / promessas
// rejeitadas do browser e regista-os nos logs do servidor (Vercel), onde podem
// ser vistos/grep por "[client-error]". Sem dependências nem serviço externo.
// Rate-limit por IP (em memória, por instância) para não inundar os logs.
import { NextRequest, NextResponse } from "next/server";

const hits = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 20; // por IP
const WINDOW = 60_000; // 1 min

function allowed(ip: string): boolean {
  const now = Date.now();
  const e = hits.get(ip);
  if (!e || now > e.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW });
    return true;
  }
  if (e.count >= LIMIT) return false;
  e.count++;
  return true;
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!allowed(ip)) return new NextResponse(null, { status: 429 });

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const message = str(body.message, 500);
  if (!message) return new NextResponse(null, { status: 400 });

  const entry = {
    kind: str(body.kind, 40) || "error",
    message,
    stack: str(body.stack, 2000),
    at: str(body.url, 300),
    ua: str(req.headers.get("user-agent"), 200),
    ip,
    ts: new Date().toISOString(),
  };

  // Visível nos logs de runtime da Vercel (grep "[client-error]").
  console.error("[client-error]", JSON.stringify(entry));
  return new NextResponse(null, { status: 204 });
}
