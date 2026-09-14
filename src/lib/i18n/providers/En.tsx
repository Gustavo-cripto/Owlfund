"use client";

import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { en } from "@/lib/i18n/messages/en";

// Provider do layout raiz /en: leva a lingua en estaticamente (sem espera, sem
// flash) e nenhuma das outras. Ver src/lib/i18n/messages/index.ts.
export default function LanguageProviderEn({ children }: { children: React.ReactNode }) {
  return <LanguageProvider messagesLang="en" messages={en} initialLang="en">{children}</LanguageProvider>;
}
