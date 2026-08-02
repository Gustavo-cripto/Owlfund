import type { Metadata } from "next";

// A página é um client component e não pode exportar metadata; este layout dá-lhe
// título e descrição próprios (o template do layout raiz junta "· ChainFolioAI").
export const metadata: Metadata = {
  title: "Política de Privacidade",
  description: "Como o ChainFolioAI recolhe, usa e protege os teus dados.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
