import "server-only";
import { getLocale } from "@/server/locale";
import { getMessages } from "./dictionary";
import { createTranslator, type TranslateFn } from "./t";
import type { Locale } from "@/core/i18n";

/**
 * Server-side translation. Reads the locale cookie and returns both the active locale and a
 * ready-to-use `t`. Server components call this directly; the locale is also handed to the client
 * provider so client components share the exact same catalogue.
 */
export async function getServerT(): Promise<{ locale: Locale; t: TranslateFn }> {
  const locale = await getLocale();
  return { locale, t: createTranslator(getMessages(locale)) };
}
