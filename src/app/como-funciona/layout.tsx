import type { Metadata } from "next";

// A página é um client component e não pode exportar metadata; este layout dá-lhe
// título e descrição próprios (o template do layout raiz junta "· ChainFolioAI").
export const metadata: Metadata = {
  title: "Como funciona",
  description: "Liga as tuas carteiras, acompanha o portefólio cripto e tradicional e recebe análises com IA — em minutos.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
