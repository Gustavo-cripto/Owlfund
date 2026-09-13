import { notFound } from "next/navigation";

import TaxGuideCountry from "@/components/guides/TaxGuideCountry";
import { COUNTRIES, countryBySlug } from "@/lib/tax/countries";
import { countryMetadata } from "@/lib/tax/guideMeta";

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
