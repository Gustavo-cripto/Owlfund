import { LanguageProvider } from "@/lib/i18n/LanguageContext";

// So fixa a lingua a partir do endereco. A metadata vive em cada page.tsx:
// declarar aqui um titulo absoluto apagava o "· ChainFolioAI" que o layout
// raiz junta aos titulos das paginas filhas.
export default function Layout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider initialLang="fr">{children}</LanguageProvider>;
}
