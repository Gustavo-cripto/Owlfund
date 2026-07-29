"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { translations, type Lang, type TranslationKey } from "./translations";

type LanguageContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: "pt",
  setLang: () => {},
  t: (key) => translations.pt[key],
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("pt");

  useEffect(() => {
    const stored = localStorage.getItem("owlfund-lang") as Lang | null;
    if (stored && stored in translations) setLangState(stored);
  }, []);

  // Mantém <html lang> em sincronia com o idioma escolhido (SEO/acessibilidade).
  useEffect(() => {
    const map: Record<Lang, string> = { pt: "pt-PT", en: "en", es: "es", fr: "fr" };
    document.documentElement.lang = map[lang];
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("owlfund-lang", l);
  };

  const t = (key: TranslationKey): string => translations[lang][key] ?? translations.pt[key];

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
