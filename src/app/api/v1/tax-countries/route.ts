import { listTaxCountries } from "@/lib/api/insights";
import { apiJson } from "@/lib/api/response";
import { rateLimitPublic } from "@/lib/api/requireUser";

export const runtime = "nodejs";
export const revalidate = 86400;

// GET /api/v1/tax-countries — regimes fiscais publicados. Dados públicos: sem chave.
export async function GET(req: Request) {
  const limitado = rateLimitPublic(req, "tax-countries", 60);
  if (limitado) return limitado;

  return apiJson(listTaxCountries());
}
