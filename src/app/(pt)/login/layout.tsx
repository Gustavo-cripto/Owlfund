import type { Metadata } from "next";
import { pageMetadata } from "@/lib/i18n/pageMeta";

// A página é um client component e não pode exportar metadata; este layout dá-lhe
// título e descrição próprios (o template do layout raiz junta "· ChainFolioAI").
export const metadata: Metadata = pageMetadata("login", "pt");

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
