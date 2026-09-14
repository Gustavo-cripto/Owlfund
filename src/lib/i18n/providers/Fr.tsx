"use client";

import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { fr } from "@/lib/i18n/messages/fr";

// Provider do layout raiz /fr: leva a lingua fr estaticamente (sem espera, sem
// flash) e nenhuma das outras. Ver src/lib/i18n/messages/index.ts.
export default function LanguageProviderFr({ children }: { children: React.ReactNode }) {
  return <LanguageProvider messagesLang="fr" messages={fr} initialLang="fr">{children}</LanguageProvider>;
}
