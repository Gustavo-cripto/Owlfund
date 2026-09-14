"use client";

import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { pt } from "@/lib/i18n/messages/pt";

// Parte "pesada" do provider de pt: o dicionario inteiro. So e importada por
// Pt.tsx atraves de next/dynamic — ver la porque.
export default function LanguageProviderPtInner({ children }: { children: React.ReactNode }) {
  return <LanguageProvider messagesLang="pt" messages={pt}>{children}</LanguageProvider>;
}
