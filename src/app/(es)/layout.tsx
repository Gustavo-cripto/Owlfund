import type { Metadata, Viewport } from "next";
import RootShell from "@/components/RootShell";
import LanguageProviderEs from "@/lib/i18n/providers/Es";
import { rootMetadata, rootViewport } from "@/lib/seo/rootMetadata";

// Layout raiz do idioma "es". Ver src/components/RootShell.tsx.
export const metadata: Metadata = rootMetadata("es");
export const viewport: Viewport = rootViewport;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="es" Provider={LanguageProviderEs}>{children}</RootShell>;
}
