import type { Metadata } from "next";

// A página é um client component e não pode exportar metadata; este layout dá-lhe
// título e descrição próprios (o template do layout raiz junta "· ChainFolioAI").
export const metadata: Metadata = {
  title: "Entrar",
  description: "Entra na tua conta ChainFolioAI para acederes ao teu portefólio.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
