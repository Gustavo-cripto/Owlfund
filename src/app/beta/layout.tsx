import type { Metadata } from "next";

// A página é um client component; este layout dá-lhe título, descrição e canonical.
export const metadata: Metadata = {
  title: "Beta — Premium grátis 60 dias",
  description: "Entra no beta do ChainFolioAI: testa a plataforma, dá feedback e recebe Premium grátis durante 60 dias.",
  alternates: { canonical: "/beta" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
