import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/api/session";
import { confirmarPalavraPasse } from "@/lib/auth/confirmarPalavraPasse";
import { rateLimit } from "@/lib/utils/rateLimit";

// Confirma a palavra-passe atual antes de a trocar, sem mexer na sessão.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user } = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (!rateLimit(`confirmar-palavra-passe:${user.id}`, 5, 60_000)) {
    return NextResponse.json({ error: "Demasiadas tentativas.", code: "RATE_LIMITED" }, { status: 429 });
  }
  const corpo = (await request.json().catch(() => null)) as { password?: unknown; captchaToken?: unknown } | null;
  const resultado = await confirmarPalavraPasse(user.email, corpo?.password, corpo?.captchaToken);
  if (resultado === "certa") return new Response(null, { status: 204 });
  if (resultado === "errada") return NextResponse.json({ error: "Palavra-passe errada.", code: "WRONG_PASSWORD" }, { status: 401 });
  return NextResponse.json({ error: "Serviço indisponível.", code: "UNAVAILABLE" }, { status: 503 });
}
