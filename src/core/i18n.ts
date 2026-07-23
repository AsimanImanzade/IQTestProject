/**
 * Locale definitions — the single source of truth for which languages the app supports.
 *
 * This lives in the pure core because both the question generators (which emit localized text) and
 * the UI layer need it. Adding a language is meant to be cheap: add its code here, add a UI message
 * catalogue, and add its strings to the generators. Everything else keys off `LOCALES`.
 *
 * English is the fallback everywhere. Any string missing in another locale falls back to English
 * rather than showing a blank — so a partially translated build is never broken, only less
 * complete.
 */

export const LOCALES = ["en", "az"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_NAMES: Record<Locale, { label: string; english: string }> = {
  // `label` is the language's own name (shown in the switcher); `english` is for accessibility
  // tooling and logs.
  en: { label: "English", english: "English" },
  az: { label: "Azərbaycan dili", english: "Azerbaijani" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function normaliseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

/**
 * A string available in one or more locales. English is required so there is always a fallback;
 * other locales are optional and resolved with `localize` below.
 */
export type LocalizedString = { en: string } & Partial<Record<Locale, string>>;

/** Resolve a localized string for a locale, falling back to English. */
export function localize(text: LocalizedString, locale: Locale): string {
  return text[locale] ?? text.en;
}

/** Which locales a localized string actually carries a translation for. */
export function availableLocales(text: LocalizedString): Locale[] {
  return LOCALES.filter((l) => typeof text[l] === "string" && text[l]!.length > 0);
}

/** Convenience builder used throughout the generators: L("hello", "salam"). */
export function L(en: string, az?: string): LocalizedString {
  return az === undefined ? { en } : { en, az };
}

/**
 * Locales that EVERY supplied localized string carries — i.e. the languages an item is fully
 * usable in. An item is only offered in a locale when all of its text (stem, explanation, every
 * option and rationale) exists in that locale; otherwise a test-taker would hit English fragments
 * mid-question. Stored on `Question.locales` and used by the sampler to filter the pool.
 */
export function commonLocales(texts: readonly LocalizedString[]): Locale[] {
  return LOCALES.filter((l) =>
    texts.every((t) => typeof t[l] === "string" && (t[l] as string).length > 0),
  );
}
