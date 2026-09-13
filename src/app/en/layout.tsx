import { LanguageProvider } from "@/lib/i18n/LanguageContext";

// So fixa a lingua a partir do endereco. A metadata vive em cada page.tsx:
// declarar aqui um titulo absoluto apagava o "· ChainFolioAI" que o layout
// raiz junta aos titulos das paginas filhas.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider initialLang="en">
      {/* O <html lang> vive no layout raiz, que e estatico e nao sabe em que
          idioma esta a servir — por isso saia "pt-PT" tambem em /en ate a
          pagina hidratar. Este script corre antes de qualquer render e corrige-o
          de imediato: leitores de ecra e o renderizador do Google veem a lingua
          certa. (O Google ignora o atributo para deteccao de idioma — o que conta
          e o conteudo e o hreflang, que ja estao certos. A solucao definitiva,
          um layout raiz por idioma, e uma reestruturacao maior; fica anotada.) */}
      <script dangerouslySetInnerHTML={{ __html: 'document.documentElement.lang="en-GB"' }} />
      {children}
    </LanguageProvider>
  );
}
