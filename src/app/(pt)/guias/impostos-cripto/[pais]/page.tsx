import { notFound } from "next/navigation";

import TaxGuideCountry from "@/components/guides/TaxGuideCountry";
import { COUNTRIES, countryBySlug } from "@/lib/tax/countries";
import { countryMetadata } from "@/lib/tax/guideMeta";

// Slugs fora da lista sao URLs nao correspondidos e caem no 404 global — sem
// render e sem notFound(), que com varios layouts raiz o Next nao consegue
// compor (ficava um invólucro de erro vazio).
export const dynamicParams = false;

export function generateStaticParams() {
  return COUNTRIES.map((c) => ({ pais: c.slug.pt }));
}

export async function generateMetadata({ params }: { params: Promise<{ pais: string }> }) {
  const { pais } = await params;
  return countryMetadata("pt", pais);
}

export default async function Page({ params }: { params: Promise<{ pais: string }> }) {
  const { pais } = await params;
  const country = countryBySlug(pais, "pt");
  if (!country) notFound();
  return <TaxGuideCountry lang="pt" country={country} />;
}
