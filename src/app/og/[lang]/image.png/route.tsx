import { ogCardResponse } from "@/lib/seo/ogCard";
import { OG_LANGS_ROTA } from "@/lib/seo/ogText";

// Cartão social (1200×630) em en/es/fr: /og/en/image.png, /og/es/image.png,
// /og/fr/image.png. Uma rota fora dos grupos (pt)/(en)/(es)/(fr) não precisa de
// layout raiz; gerada no build (generateStaticParams) e servida como ficheiro.
// O pt continua em /opengraph-image (src/app/opengraph-image.tsx).
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return OG_LANGS_ROTA.map((lang) => ({ lang }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const l = OG_LANGS_ROTA.find((x) => x === lang);
  if (!l) return new Response("Not found", { status: 404 });
  return ogCardResponse(l);
}
