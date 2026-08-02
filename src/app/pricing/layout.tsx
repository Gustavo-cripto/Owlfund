import type { Metadata } from "next";

// A página é um client component e não pode exportar metadata; este layout dá-lhe
// título e descrição próprios (o template do layout raiz junta "· ChainFolioAI").
export const metadata: Metadata = {
  title: "Preços e planos",
  description: "Compara os planos Gratuito, Pro e Premium do ChainFolioAI: carteiras ilimitadas, análise IA, fiscalidade e relatórios.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
