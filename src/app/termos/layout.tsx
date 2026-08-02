import type { Metadata } from "next";

// A página é um client component e não pode exportar metadata; este layout dá-lhe
// título e descrição próprios (o template do layout raiz junta "· ChainFolioAI").
export const metadata: Metadata = {
  title: "Termos e Condições",
  description: "Termos e condições de utilização do ChainFolioAI.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
