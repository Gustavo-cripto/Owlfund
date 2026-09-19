// Monitorização leve de erros do cliente. Recebe erros de JS / promessas
// rejeitadas do browser e regista-os nos logs do servidor (Vercel), onde podem
// ser vistos/grep por "[client-error]". Sem dependências nem serviço externo.
// Rate-limit por IP (em memória, por instância) para não inundar os logs.
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

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


/** So o caminho: sem query string e sem fragmento, e sempre a comecar por "/". */
function caminhoSeguro(valor: string): string {
  const p = valor.split(/[?#]/)[0];
  return p.startsWith("/") ? p.slice(0, 300) : "";
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  // Nos registos fica so um resumo irreversivel: chega para ver se e sempre o
  // mesmo visitante, sem guardar o endereco em claro.
  const ipAnonimo = createHash("sha256").update(`client-error:${ip}`).digest("hex").slice(0, 16);
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
    // So o caminho, e saneado aqui tambem: um cliente antigo em cache (ou
    // qualquer pessoa) pode continuar a mandar o href inteiro, e o fragmento
    // dos links de recuperacao traz o token de sessao.
    at: caminhoSeguro(str(body.url, 300)),
    ua: str(req.headers.get("user-agent"), 200),
    ip: ipAnonimo,
    ts: new Date().toISOString(),
  };

  // Visível nos logs de runtime da Vercel (grep "[client-error]").
  console.error("[client-error]", JSON.stringify(entry));
  return new NextResponse(null, { status: 204 });
}
