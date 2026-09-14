import type { Metadata, Viewport } from "next";
import RootShell from "@/components/RootShell";
import LanguageProviderPt from "@/lib/i18n/providers/Pt";
import { rootMetadata, rootViewport } from "@/lib/seo/rootMetadata";

// Layout raiz do idioma "pt". Ver src/components/RootShell.tsx.
export const metadata: Metadata = rootMetadata("pt");
export const viewport: Viewport = rootViewport;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="pt" Provider={LanguageProviderPt}>{children}</RootShell>;
}
