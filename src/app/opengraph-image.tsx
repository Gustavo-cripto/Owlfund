import { ogCardResponse } from "@/lib/seo/ogCard";
import { OG_TEXT } from "@/lib/seo/ogText";

export const alt = OG_TEXT.pt.alt;
// Literal de proposito: o Next le isto para o og:image:width/height. O teste
// scripts/testes/ogImages.test.ts confirma que bate com OG_SIZE (1200×630).
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Cartão social gerado dinamicamente (1200×630), versão portuguesa. O desenho
// e os textos das 4 línguas estão em src/lib/seo/ogCard.tsx e ogText.ts; en/es/fr
// saem em /og/xx/image.png (src/app/og/[lang]/image.png/route.tsx).
export default async function Image() {
  return ogCardResponse("pt");
}
