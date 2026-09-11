"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
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
    const map: Record<Lang, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };
    document.documentElement.lang = map[lang];
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    localStorage.setItem("owlfund-lang", l);
  };

  // `t` tem identidade estavel e le sempre o idioma atual por referencia.
  //
  // Porque: dezenas de useCallback/useEffect pelo site nao listam `t` nas
  // dependencias. Com um `t` recriado a cada render, esses callbacks ficavam
  // presos ao idioma que estava ativo quando foram criados — a pessoa trocava
  // para ingles e a mensagem de erro seguinte ainda saia em portugues.
  const langRef = useRef(lang);
  langRef.current = lang;
  const t = useCallback(
    (key: TranslationKey): string => translations[langRef.current][key] ?? translations.pt[key],
    [],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
