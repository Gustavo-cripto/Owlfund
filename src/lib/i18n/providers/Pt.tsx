"use client";

import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { pt } from "@/lib/i18n/messages/pt";

// Provider do layout raiz /: leva a lingua pt estaticamente (sem espera, sem
// flash) e nenhuma das outras. Ver src/lib/i18n/messages/index.ts.
export default function LanguageProviderPt({ children }: { children: React.ReactNode }) {
  return <LanguageProvider messagesLang="pt" messages={pt}>{children}</LanguageProvider>;
}
