import type { Metadata } from "next";
import RootShell from "@/components/RootShell";
import { rootMetadata } from "@/lib/seo/rootMetadata";

// Layout raiz do idioma "en". Ver src/components/RootShell.tsx.
export const metadata: Metadata = rootMetadata("en");

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang="en">{children}</RootShell>;
}
