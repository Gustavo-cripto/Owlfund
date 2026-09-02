// i18n da app — mesmos 4 idiomas do site (PT/EN/ES/FR), preferência
// persistida. Fundação: menu/tabs/labels comuns primeiro; os ecrãs vão
// sendo traduzidos progressivamente.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

export type Lang = 'pt' | 'en' | 'es' | 'fr';

const KEY = 'app_lang_v1';

const DICT = {
  pt: {
    tab_portfolio: 'Portfolio', tab_mercado: 'Mercado', tab_gerenciar: 'Gerenciar', tab_mais: 'Mais', tab_conta: 'Conta',
    menu_dashboard: 'Dashboard', menu_portfolio: 'Portfolio', menu_carteiras: 'Carteiras', menu_smart: 'Smart Money',
    menu_gestor: 'Gestor IA', menu_mercado: 'Mercado', menu_historico: 'Histórico', menu_impostos: 'Impostos',
    menu_fire: 'FIRE', menu_planos: 'Planos', menu_conta: 'Conta', menu_api: 'API & MCP', menu_beta: 'Beta',
    mais_title: 'Mais', mais_sub: 'Tudo o que tens no site, dentro da app', sair: 'Sair',
    nativo: 'Nativo', site_embutido: 'Abre o site dentro da app',
  },
  en: {
    tab_portfolio: 'Portfolio', tab_mercado: 'Market', tab_gerenciar: 'Manage', tab_mais: 'More', tab_conta: 'Account',
    menu_dashboard: 'Dashboard', menu_portfolio: 'Portfolio', menu_carteiras: 'Wallets', menu_smart: 'Smart Money',
    menu_gestor: 'AI Manager', menu_mercado: 'Market', menu_historico: 'History', menu_impostos: 'Taxes',
    menu_fire: 'FIRE', menu_planos: 'Plans', menu_conta: 'Account', menu_api: 'API & MCP', menu_beta: 'Beta',
    mais_title: 'More', mais_sub: 'Everything from the site, inside the app', sair: 'Log out',
    nativo: 'Native', site_embutido: 'Opens the site inside the app',
  },
  es: {
    tab_portfolio: 'Portfolio', tab_mercado: 'Mercado', tab_gerenciar: 'Gestionar', tab_mais: 'Más', tab_conta: 'Cuenta',
    menu_dashboard: 'Dashboard', menu_portfolio: 'Portfolio', menu_carteiras: 'Carteras', menu_smart: 'Smart Money',
    menu_gestor: 'Gestor IA', menu_mercado: 'Mercado', menu_historico: 'Historial', menu_impostos: 'Impuestos',
    menu_fire: 'FIRE', menu_planos: 'Planes', menu_conta: 'Cuenta', menu_api: 'API & MCP', menu_beta: 'Beta',
    mais_title: 'Más', mais_sub: 'Todo lo del sitio, dentro de la app', sair: 'Salir',
    nativo: 'Nativo', site_embutido: 'Abre el sitio dentro de la app',
  },
  fr: {
    tab_portfolio: 'Portfolio', tab_mercado: 'Marché', tab_gerenciar: 'Gérer', tab_mais: 'Plus', tab_conta: 'Compte',
    menu_dashboard: 'Dashboard', menu_portfolio: 'Portfolio', menu_carteiras: 'Portefeuilles', menu_smart: 'Smart Money',
    menu_gestor: 'Gestion IA', menu_mercado: 'Marché', menu_historico: 'Historique', menu_impostos: 'Impôts',
    menu_fire: 'FIRE', menu_planos: 'Offres', menu_conta: 'Compte', menu_api: 'API & MCP', menu_beta: 'Bêta',
    mais_title: 'Plus', mais_sub: 'Tout le site, dans l’app', sair: 'Déconnexion',
    nativo: 'Natif', site_embutido: 'Ouvre le site dans l’app',
  },
} as const;

export type TKey = keyof (typeof DICT)['pt'];

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (k: TKey) => string };

const LanguageContext = createContext<Ctx>({ lang: 'pt', setLang: () => {}, t: (k) => DICT.pt[k] });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('pt');

  useEffect(() => {
    (async () => {
      try {
        const saved =
          Platform.OS === 'web' ? localStorage.getItem(KEY) : await AsyncStorage.getItem(KEY);
        if (saved === 'pt' || saved === 'en' || saved === 'es' || saved === 'fr') setLangState(saved);
      } catch { /* fica pt */ }
    })();
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      if (Platform.OS === 'web') localStorage.setItem(KEY, l);
      else AsyncStorage.setItem(KEY, l).catch(() => {});
    } catch { /* ignore */ }
  };

  const value = useMemo<Ctx>(() => ({ lang, setLang, t: (k) => DICT[lang][k] }), [lang]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
