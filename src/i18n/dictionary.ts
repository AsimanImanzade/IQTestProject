import type { Locale } from "@/core/i18n";
import { en, type Messages } from "./messages/en";
import { az } from "./messages/az";

/**
 * Resolve the full message set for a locale.
 *
 * The az catalogue is typed as the complete `Messages` shape, so it already contains every key —
 * but should a future locale be added as a partial, deep-merging it over English here guarantees
 * `t` can never miss a key. English is always the base.
 */
const CATALOGUES: Record<Locale, Messages> = { en, az };

export function getMessages(locale: Locale): Messages {
  return CATALOGUES[locale] ?? en;
}
