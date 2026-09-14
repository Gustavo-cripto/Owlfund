import type { Metadata, Viewport } from "next";
import RootShell from "@/components/RootShell";
import { rootMetadata, rootViewport } from "@/lib/seo/rootMetadata";

// Layout raiz do idioma "fr". Ver src/components/RootShell.tsx.
export const metadata: Metadata = rootMetadata("fr");
export const viewport: Viewport = rootViewport;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="fr">{children}</RootShell>;
}
