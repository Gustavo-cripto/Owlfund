import type { Metadata } from "next";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { pageMetadata } from "@/lib/i18n/pageMeta";

// O idioma vem do endereco, nao do browser: quem abre /es tem de ver "es",
// e o Google tem de receber o HTML nessa lingua.
export const metadata: Metadata = pageMetadata("home", "es");

export default function Layout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider initialLang="es">{children}</LanguageProvider>;
}
