import type { Metadata } from "next";
import RootShell from "@/components/RootShell";
import { rootMetadata } from "@/lib/seo/rootMetadata";

// Layout raiz do idioma "pt". Ver src/components/RootShell.tsx.
export const metadata: Metadata = rootMetadata("pt");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="pt">{children}</RootShell>;
}
