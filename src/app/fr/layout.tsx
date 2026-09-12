import type { Metadata } from "next";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { pageMetadata } from "@/lib/i18n/pageMeta";

// O idioma vem do endereco, nao do browser: quem abre /fr tem de ver "fr",
// e o Google tem de receber o HTML nessa lingua.
export const metadata: Metadata = pageMetadata("home", "fr");

export default function Layout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider initialLang="fr">{children}</LanguageProvider>;
}
