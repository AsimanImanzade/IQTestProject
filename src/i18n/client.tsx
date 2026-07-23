"use client";

import { createContext, useContext, useMemo } from "react";
import type { Locale } from "@/core/i18n";
import { getMessages } from "./dictionary";
import { createTranslator, type TranslateFn } from "./t";

/**
 * Client-side translation.
 *
 * The active locale is provided once at the root (from the server, which read the cookie) and the
 * catalogue is looked up on the client. Because the catalogues are plain data compiled into the
 * bundle, this needs no network round-trip and no hydration mismatch: server and client resolve
 * the identical strings for the identical locale.
 */
interface I18nContextValue {
  locale: Locale;
  t: TranslateFn;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo<I18nContextValue>(
    () => ({ locale, t: createTranslator(getMessages(locale)) }),
    [locale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within an I18nProvider");
  return value;
}

/** Shorthand: const t = useT(). */
export function useT(): TranslateFn {
  return useI18n().t;
}
