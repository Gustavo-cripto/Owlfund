import { notFound } from "next/navigation";

import ComparisonPage from "@/components/compare/ComparisonPage";
import { COMPETITORS, competitorBySlug } from "@/lib/compare/competitors";
import { compareMetadata } from "@/lib/compare/compareMeta";

// Geradas em build: sao paginas de conteudo, nao mudam por utilizador.
// Slugs fora da lista sao URLs nao correspondidos e caem no 404 global — sem
// render e sem notFound(), que com varios layouts raiz o Next nao consegue
// compor (ficava um invólucro de erro vazio, sem texto nem lang). Como nos guias.
export const dynamicParams = false;

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
