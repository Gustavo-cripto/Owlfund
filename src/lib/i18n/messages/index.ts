import type { Lang } from "../translations";
import type { TranslationKey } from "./pt";

export type Messages = Record<TranslationKey, string>;

// Cada import() e um chunk separado: o browser so vai buscar a lingua para que
// a pessoa trocou, uma vez, e fica em cache. A lingua do layout raiz (pt em /,
// en em /en, …) nao passa por aqui — entra estaticamente pelo provider de cada
// layout (src/lib/i18n/providers/*.tsx), por isso nunca ha ecra sem texto.
export const loadMessages: Record<Lang, () => Promise<Messages>> = {
  pt: () => import("./pt").then((m) => m.pt),
  en: () => import("./en").then((m) => m.en),
  es: () => import("./es").then((m) => m.es),
  fr: () => import("./fr").then((m) => m.fr),
};
