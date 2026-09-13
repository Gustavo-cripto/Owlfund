import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "@/app/globals.css";
import FloatingChat from "@/components/FloatingChat";
import ErrorMonitor from "@/components/ErrorMonitor";
import { LanguageProvider } from "@/lib/i18n/LanguageContext";
import { ThemeProvider } from "@/lib/theme/ThemeContext";
import type { Lang } from "@/lib/i18n/translations";
import { HTML_LANG, JSON_LD } from "@/lib/seo/rootMetadata";

// O <html> de cada idioma. E o unico sitio onde `lang` e decidido no servidor:
// antes vivia num so layout raiz, estatico, que dizia "pt-PT" tambem em /en, e
// so era corrigido depois de a pagina hidratar. Com um layout raiz por idioma
// (src/app/(pt), (en), (es), (fr)) o HTML cru ja vem certo — e sem tornar
// nenhuma pagina dinamica.
//
// Em portugues `initialLang` fica indefinido de proposito: e a raiz sem
// prefixo, e ai quem manda e a escolha guardada no browser.
export default function RootShell({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return (
    <html lang={HTML_LANG[lang]} suppressHydrationWarning>
      <body className="antialiased">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
        <ThemeProvider>
          <LanguageProvider initialLang={lang === "pt" ? undefined : lang}>
            {children}
            <FloatingChat />
            <ErrorMonitor />
          </LanguageProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
