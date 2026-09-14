"use client";

import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { fr } from "@/lib/i18n/messages/fr";

// Parte "pesada" do provider de fr: o dicionario inteiro. So e importada por
// Fr.tsx atraves de next/dynamic — ver la porque.
export default function LanguageProviderFrInner({ children }: { children: React.ReactNode }) {
  return <LanguageProvider messagesLang="fr" messages={fr} initialLang="fr">{children}</LanguageProvider>;
}
