"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/core/i18n";
import { useI18n } from "@/i18n/client";
import { cn } from "@/lib/utils";

/**
 * Language selector, available to everyone in the header.
 *
 * A native <select> is used on purpose: it is fully keyboard-accessible and screen-reader-friendly
 * with no custom ARIA to get wrong, and it collapses to the platform picker on mobile. Changing the
 * value posts the choice (which sets the cookie, and saves it to the profile when signed in) and
 * refreshes the server components so every translated string re-renders in the new language.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [busy, setBusy] = useState(false);

  async function change(next: Locale) {
    if (next === locale || busy) return;
    setBusy(true);
    try {
      await fetch("/api/locale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: next }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className={cn("relative inline-flex items-center", className)}>
      <span className="sr-only">{t("common.switchLanguage")}</span>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute left-2.5 h-4 w-4 text-content-subtle"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
      </svg>
      <select
        value={locale}
        disabled={busy}
        onChange={(e) => change(e.target.value as Locale)}
        className={cn(
          "h-11 appearance-none rounded-xl border border-border bg-surface-raised pl-8 pr-8 text-sm font-medium",
          "text-content transition-colors hover:bg-surface-sunken focus:border-accent disabled:opacity-60",
        )}
      >
        {LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_NAMES[code].label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        className="pointer-events-none absolute right-2.5 h-4 w-4 text-content-subtle"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
      </svg>
    </label>
  );
}
