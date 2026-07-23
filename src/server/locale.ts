import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, normaliseLocale, type Locale } from "@/core/i18n";

/**
 * Locale resolution for the server.
 *
 * The cookie is the source of truth for rendering, which is what makes the feature work for
 * guests — they have no profile, but they do have a cookie. A signed-in user's stored preference
 * is written into the same cookie at login and whenever they change it, so the two never disagree
 * at render time and every code path can simply read the cookie.
 */

export const LOCALE_COOKIE = "iq_lang";
const ONE_YEAR = 365 * 24 * 60 * 60;

/** The active locale for this request, from the cookie, falling back to the default. */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normaliseLocale(store.get(LOCALE_COOKIE)?.value);
}

/** Persist a locale choice in the cookie. Safe for guests and signed-in users alike. */
export async function setLocaleCookie(locale: Locale): Promise<void> {
  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    httpOnly: false, // read by the client switcher too; contains no sensitive data
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR,
  });
}

/**
 * Reconcile a signed-in user's stored language with the cookie at login.
 * If they have a saved preference it wins; otherwise the current cookie choice is adopted as their
 * preference so a guest who picked a language keeps it after signing up.
 */
export function resolveLoginLocale(
  storedPreference: string | null,
  cookieValue: string | undefined,
): Locale {
  if (isLocale(storedPreference)) return storedPreference;
  if (isLocale(cookieValue)) return cookieValue;
  return DEFAULT_LOCALE;
}
