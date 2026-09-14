"use client";

import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { en } from "@/lib/i18n/messages/en";

// Parte "pesada" do provider de en: o dicionario inteiro. So e importada por
// En.tsx atraves de next/dynamic — ver la porque.
export default function LanguageProviderEnInner({ children }: { children: React.ReactNode }) {
  return <LanguageProvider messagesLang="en" messages={en} initialLang="en">{children}</LanguageProvider>;
}
