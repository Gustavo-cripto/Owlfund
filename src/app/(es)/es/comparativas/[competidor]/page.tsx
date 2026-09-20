import { notFound } from "next/navigation";

import ComparisonPage from "@/components/compare/ComparisonPage";
import { COMPETITORS, competitorBySlug } from "@/lib/compare/competitors";
import { compareMetadata } from "@/lib/compare/compareMeta";

// Geradas em build: sao paginas de conteudo, nao mudam por utilizador.
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
