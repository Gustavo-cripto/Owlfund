import { NextResponse } from "next/server";
import { apiLang, apiMsg } from "@/lib/api/apiMessages";
import { friendlyAiError, errorStatus, hasAnyAiProvider } from "@/lib/ai/groq";
import { requireUser } from "@/lib/api/requireUser";
import { getPlanOrNull, planUnavailableResponse, requiresPlanResponse } from "@/lib/api/entitlement";
import { generateMarketBriefing } from "@/lib/ai/briefingMercado";
import { langMercado, modoMercado } from "@/lib/ai/promptsMercado";

// A geração (dados + prompt + cache de 45 min) vive em src/lib/ai/briefingMercado.ts,
// partilhada com o Chat de Mercado (auditoria 8 out 2026, mercado-02).

// Chamada a fornecedor de IA: pode demorar. Sem isto a funcao usa o tempo por
// omissao da plataforma e corta a meio uma resposta que ia chegar.
export const maxDuration = 60;

export async function POST(request: Request) {
  // Gera IA paga: só com sessão e plano Pro/Premium (antes qualquer pessoa na
  // internet podia invocar esta rota).
  const auth = await requireUser(request, { route: "market-news", limit: 10 });
  if (!auth.ok) return auth.response;
  const plan = await getPlanOrNull(auth.userId);
  if (!plan) return planUnavailableResponse();
  if (plan === "free") return requiresPlanResponse("pro");

  let body: { mode?: unknown; lang?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: apiMsg(request, "invalid_body"), code: "invalid_body" }, { status: 400 });
  }
  // Só valores conhecidos: antes "pt1", "pt2"… criavam entradas de cache novas
  // (e uma geração nova cada) e o texto saía sempre em português.
  const mode = body?.mode === undefined ? "crypto" : modoMercado(body.mode);
  if (!mode) return NextResponse.json({ error: apiMsg(request, "invalid_body"), code: "invalid_mode" }, { status: 400 });
  const lang = langMercado(body?.lang) ?? apiLang(request);

  if (!hasAnyAiProvider()) return NextResponse.json({ error: apiMsg(request, "ai_unconfigured"), code: "ai_unconfigured" }, { status: 503 });

  try {
    const result = await generateMarketBriefing(mode, lang);
    return NextResponse.json(result);
  } catch (err) {
    const status = errorStatus(err);
    return NextResponse.json(
      { error: friendlyAiError(status, lang) },
      { status: status === 429 ? 429 : 502 },
    );
  }
}
