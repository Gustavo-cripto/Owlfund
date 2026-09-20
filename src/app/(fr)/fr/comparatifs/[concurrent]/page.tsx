import { notFound } from "next/navigation";

import ComparisonPage from "@/components/compare/ComparisonPage";
import { COMPETITORS, competitorBySlug } from "@/lib/compare/competitors";
import { compareMetadata } from "@/lib/compare/compareMeta";

// Geradas em build: sao paginas de conteudo, nao mudam por utilizador.
export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ concurrent: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ concurrent: string }> }) {
  const slug = (await params).concurrent;
  return compareMetadata("fr", slug);
}

export default async function Page({ params }: { params: Promise<{ concurrent: string }> }) {
  const slug = (await params).concurrent;
  const dados = competitorBySlug(slug);
  if (!dados) notFound();
  return <ComparisonPage lang="fr" competitor={dados} />;
}
