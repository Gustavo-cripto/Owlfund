import { notFound } from "next/navigation";

import TaxGuideCountry from "@/components/guides/TaxGuideCountry";
import { COUNTRIES, countryBySlug } from "@/lib/tax/countries";
import { countryMetadata } from "@/lib/tax/guideMeta";

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
