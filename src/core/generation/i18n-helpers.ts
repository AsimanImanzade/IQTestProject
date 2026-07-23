/**
 * Localization helpers shared by every generator.
 *
 * The pattern throughout the generators is: build a string per locale from the same structured
 * data, then wrap the results in a `LocalizedString`. `buildLocalized` does exactly that, so a
 * generator writes its templating logic once and gets both languages out.
 *
 * Adding a third language later means: add it to `LOCALES` (core/i18n.ts), extend the word tables
 * here and in the other generator message tables, and `buildLocalized` picks it up automatically.
 */

import { LOCALES, type Locale, type LocalizedString } from "../i18n";

/**
 * Build a `LocalizedString` by calling `render` once per supported locale.
 * English is always present (the type requires it); other locales are included as produced.
 */
export function buildLocalized(render: (locale: Locale) => string): LocalizedString {
  const result = { en: render("en") } as LocalizedString;
  for (const locale of LOCALES) {
    if (locale === "en") continue;
    result[locale] = render(locale);
  }
  return result;
}

/** Join a list into a natural-language conjunction ("a, b and c" / "a, b və c"). */
export function joinList(items: readonly string[], locale: Locale): string {
  if (items.length <= 1) return items[0] ?? "";
  const head = items.slice(0, -1).join(", ");
  const last = items[items.length - 1];
  const conj = locale === "az" ? "və" : "and";
  return `${head} ${conj} ${last}`;
}
