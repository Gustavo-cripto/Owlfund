"use client";

import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { es } from "@/lib/i18n/messages/es";

// Provider do layout raiz /es: leva a lingua es estaticamente (sem espera, sem
// flash) e nenhuma das outras. Ver src/lib/i18n/messages/index.ts.
export default function LanguageProviderEs({ children }: { children: React.ReactNode }) {
  return <LanguageProvider messagesLang="es" messages={es} initialLang="es">{children}</LanguageProvider>;
}
