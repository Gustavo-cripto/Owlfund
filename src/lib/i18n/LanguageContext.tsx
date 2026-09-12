"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { translations, type Lang, type TranslationKey } from "./translations";
import { pageFromPath, pageUrl } from "./routes";

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

/**
 * `initialLang` fixa o idioma a partir do URL (ex.: /fr/tarifs). Nesse caso o
 * que estiver guardado no browser NAO manda: quem abre um endereco em frances
 * tem de ver frances, mesmo que da ultima vez tenha escolhido portugues — e o
 * mesmo vale para o Google, que le o HTML que o servidor manda.
 */
export function LanguageProvider({
  children,
  initialLang,
}: {
  children: React.ReactNode;
  initialLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? "pt");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (initialLang) {
      // Quem chega a /fr vindo de uma pesquisa nao tem nada guardado. Fixar aqui
      // a escolha faz com que os passos seguintes — mesmo os que ainda so tem
      // endereco em portugues, como /dashboard — apareçam na lingua certa.
      try { localStorage.setItem("owlfund-lang", initialLang); } catch { /* modo privado */ }
      return;
    }
    const stored = localStorage.getItem("owlfund-lang") as Lang | null;
    if (stored && stored in translations) setLangState(stored);
  }, [initialLang]);

  // Mantém <html lang> em sincronia com o idioma escolhido (SEO/acessibilidade)
  // e leva o idioma ao servidor num cookie: as rotas de API devolvem frases que
  // o ecrã mostra tal e qual, e sem isto sairiam sempre em português.
  // É só preferência de apresentação — nunca serve para autorizar nada.
  useEffect(() => {
    const map: Record<Lang, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };
    document.documentElement.lang = map[lang];
    document.cookie = `cfa-lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
  }, [lang]);

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("owlfund-lang", l); } catch { /* modo privado */ }
    // Numa pagina publica com endereco proprio por idioma, trocar de idioma tem
    // de trocar tambem de endereco — senao ficava /fr/tarifs a mostrar espanhol,
    // e era esse URL que a pessoa partilhava.
    const here = pageFromPath(pathname ?? "");
    if (here) router.push(pageUrl(here.page, l));
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
