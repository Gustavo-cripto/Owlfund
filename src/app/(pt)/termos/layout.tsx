import type { Metadata } from "next";

// A página é um client component e não pode exportar metadata; este layout dá-lhe
// título e descrição próprios (o template do layout raiz junta "· ChainFolioAI").
export const metadata: Metadata = {
  // Era a unica pagina publica sem canonical. Sem ele, o Google pode tratar
  // variantes com query string (?src=reddit, por exemplo) como paginas
  // diferentes e dividir o valor entre elas.
  alternates: { canonical: "/termos" },
  title: "Termos e Condições",
  description: "Termos e condições de utilização do ChainFolioAI.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
