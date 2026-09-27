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
  return COMPETITORS.map((c) => ({ competidor: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ competidor: string }> }) {
  const slug = (await params).competidor;
  return compareMetadata("es", slug);
}

export default async function Page({ params }: { params: Promise<{ competidor: string }> }) {
  const slug = (await params).competidor;
  const dados = competitorBySlug(slug);
  if (!dados) notFound();
  return <ComparisonPage lang="es" competitor={dados} />;
}
