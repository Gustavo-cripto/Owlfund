"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Lang, TranslationKey } from "./translations";
import { loadMessages, type Messages } from "./messages";
import { pageFromPath, pageUrl } from "./routes";
import { createClient } from "@/lib/supabase/client";
import { langFromMetadata } from "@/lib/user/lang";

type LanguageContextValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue>({
  lang: "pt",
  setLang: () => {},
  t: (key) => key,
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
  messagesLang,
  messages,
}: {
  children: React.ReactNode;
  initialLang?: Lang;
  /** Lingua do dicionario que vem estaticamente com o layout raiz. */
  messagesLang: Lang;
  messages: Messages;
}) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? messagesLang);
  const router = useRouter();
  const pathname = usePathname();

  // Dicionarios ja em memoria. O do layout esta sempre; os outros chegam por
  // import() quando sao pedidos e ficam aqui para o resto da sessao.
  const dicts = useRef<Partial<Record<Lang, Messages>>>({ [messagesLang]: messages });
  // So se muda de lingua DEPOIS de o dicionario estar em memoria: nunca ha um
  // render com chaves em vez de frases.
  const withMessages = useCallback((l: Lang, then: () => void) => {
    if (dicts.current[l]) { then(); return; }
    loadMessages[l]().then((d) => { dicts.current[l] = d; then(); }).catch(() => { /* fica na lingua atual */ });
  }, []);

  useEffect(() => {
    if (initialLang) {
      // Quem chega a /fr vindo de uma pesquisa nao tem nada guardado. Fixar aqui
      // a escolha faz com que os passos seguintes — mesmo os que ainda so tem
      // endereco em portugues, como /dashboard — apareçam na lingua certa.
      try { localStorage.setItem("owlfund-lang", initialLang); } catch { /* modo privado */ }
      return;
    }
    const stored = localStorage.getItem("owlfund-lang") as Lang | null;
    if (stored && stored in loadMessages && stored !== messagesLang) withMessages(stored, () => setLangState(stored));
  }, [initialLang, messagesLang, withMessages]);

  // Mantém <html lang> em sincronia com o idioma escolhido (SEO/acessibilidade)
  // e leva o idioma ao servidor num cookie: as rotas de API devolvem frases que
  // o ecrã mostra tal e qual, e sem isto sairiam sempre em português.
  // É só preferência de apresentação — nunca serve para autorizar nada.
  useEffect(() => {
    const map: Record<Lang, string> = { pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR" };
    document.documentElement.lang = map[lang];
    document.cookie = `cfa-lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
  }, [lang]);

  // Leva a lingua a conta (user_metadata.lang, sem migracao — como o nickname):
  // e dai que os emails que saem do servidor (beta, avisos, briefing) sabem em
  // que lingua falar com cada pessoa. Com atraso, para gravar so o valor final
  // e nao o "pt" de arranque. Sem sessao nao faz nada; nunca bloqueia o ecra.
  useEffect(() => {
    const id = setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (!user) return;
        const patch: Record<string, string> = {};
        if (langFromMetadata(user.user_metadata) !== lang) patch.lang = lang;
        // Canal de aquisicao (cookie cfa-src posto pelo middleware no primeiro
        // toque): fica na conta uma unica vez, para o marketing saber de onde
        // vem cada conta e nao so cada visita.
        const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
        const src = /(?:^|;\s*)cfa-src=([A-Za-z0-9_-]{1,40})/.exec(document.cookie)?.[1];
        if (src && typeof meta.src !== "string") patch.src = src;
        if (Object.keys(patch).length === 0) return;
        await supabase.auth.updateUser({ data: patch });
      } catch { /* sem env, sem sessao, sem rede: fica para a proxima */ }
    }, 1500);
    return () => clearTimeout(id);
  }, [lang]);

  const setLang = (l: Lang) => {
    withMessages(l, () => {
      setLangState(l);
      try { localStorage.setItem("owlfund-lang", l); } catch { /* modo privado */ }
      // Numa pagina publica com endereco proprio por idioma, trocar de idioma tem
      // de trocar tambem de endereco — senao ficava /fr/tarifs a mostrar espanhol,
      // e era esse URL que a pessoa partilhava.
      const here = pageFromPath(pathname ?? "");
      if (here) router.push(pageUrl(here.page, l));
    });
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
    (key: TranslationKey): string => (dicts.current[langRef.current] ?? messages)[key] ?? messages[key] ?? key,
    [messages],
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
