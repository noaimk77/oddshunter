import "server-only";
import type { Locale } from "./locales";
import type { Dictionary } from "./dictionaries/fr";

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  fr: () => import("./dictionaries/fr").then((m) => m.default),
  en: () => import("./dictionaries/en").then((m) => m.default as Dictionary),
  es: () => import("./dictionaries/es").then((m) => m.default as Dictionary),
  ru: () => import("./dictionaries/ru").then((m) => m.default as Dictionary),
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return loaders[locale]();
}
