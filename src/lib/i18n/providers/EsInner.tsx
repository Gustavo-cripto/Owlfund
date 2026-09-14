"use client";

import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { es } from "@/lib/i18n/messages/es";

// Parte "pesada" do provider de es: o dicionario inteiro. So e importada por
// Es.tsx atraves de next/dynamic — ver la porque.
export default function LanguageProviderEsInner({ children }: { children: React.ReactNode }) {
  return <LanguageProvider messagesLang="es" messages={es} initialLang="es">{children}</LanguageProvider>;
}
