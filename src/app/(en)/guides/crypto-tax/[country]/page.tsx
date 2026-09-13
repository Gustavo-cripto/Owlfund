import { notFound } from "next/navigation";

import TaxGuideCountry from "@/components/guides/TaxGuideCountry";
import { COUNTRIES, countryBySlug } from "@/lib/tax/countries";
import { countryMetadata } from "@/lib/tax/guideMeta";

// Slugs fora da lista sao URLs nao correspondidos e caem no 404 global — sem
// render e sem notFound(), que com varios layouts raiz o Next nao consegue
// compor (ficava um invólucro de erro vazio).
export const dynamicParams = false;

export function generateStaticParams() {
  return COUNTRIES.map((c) => ({ country: c.slug.en }));
}

export async function generateMetadata({ params }: { params: Promise<{ country: string }> }) {
  const { country } = await params;
  return countryMetadata("en", country);
}

export default async function Page({ params }: { params: Promise<{ country: string }> }) {
  const { country: slug } = await params;
  const country = countryBySlug(slug, "en");
  if (!country) notFound();
  return <TaxGuideCountry lang="en" country={country} />;
}
