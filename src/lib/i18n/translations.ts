import { pt } from "./messages/pt";
import { en } from "./messages/en";
import { es } from "./messages/es";
import { fr } from "./messages/fr";

export type Lang = "pt" | "en" | "es" | "fr";
export type { TranslationKey } from "./messages/pt";

// As quatro linguas juntas — SO PARA O SERVIDOR (apiMsg, countryText nos guias
// estaticos). Importar isto de um componente cliente poe as quatro linguas no
// bundle de toda a gente; no cliente usa-se useLanguage().t, que so tem a
// lingua ativa (src/lib/i18n/LanguageContext.tsx).
export const translations = { pt, en, es, fr } satisfies Record<Lang, Record<string, string>>;
