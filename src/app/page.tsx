// A página em si vive em src/components/pages/Landing.tsx, partilhada com as
// versões /en, /es e /fr — a mesma página, com endereço e metadata próprios
// por idioma (ver src/lib/i18n/routes.ts).
import type { Metadata } from "next";
import Landing from "@/components/pages/Landing";
import { pageMetadata } from "@/lib/i18n/pageMeta";

export const metadata: Metadata = pageMetadata("home", "pt");

export default function Page() {
  return <Landing />;
}
