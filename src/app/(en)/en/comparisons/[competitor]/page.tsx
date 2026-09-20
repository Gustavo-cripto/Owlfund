import { notFound } from "next/navigation";

import ComparisonPage from "@/components/compare/ComparisonPage";
import { COMPETITORS, competitorBySlug } from "@/lib/compare/competitors";
import { compareMetadata } from "@/lib/compare/compareMeta";

// Geradas em build: sao paginas de conteudo, nao mudam por utilizador.
export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ competitor: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ competitor: string }> }) {
  const slug = (await params).competitor;
  return compareMetadata("en", slug);
}

export default async function Page({ params }: { params: Promise<{ competitor: string }> }) {
  const slug = (await params).competitor;
  const dados = competitorBySlug(slug);
  if (!dados) notFound();
  return <ComparisonPage lang="en" competitor={dados} />;
}
