import { notFound } from "next/navigation";

import ComparisonPage from "@/components/compare/ComparisonPage";
import { COMPETITORS, competitorBySlug } from "@/lib/compare/competitors";
import { compareMetadata } from "@/lib/compare/compareMeta";

// Geradas em build: sao paginas de conteudo, nao mudam por utilizador.
export function generateStaticParams() {
  return COMPETITORS.map((c) => ({ concorrente: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ concorrente: string }> }) {
  const slug = (await params).concorrente;
  return compareMetadata("pt", slug);
}

export default async function Page({ params }: { params: Promise<{ concorrente: string }> }) {
  const slug = (await params).concorrente;
  const dados = competitorBySlug(slug);
  if (!dados) notFound();
  return <ComparisonPage lang="pt" competitor={dados} />;
}
