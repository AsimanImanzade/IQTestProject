"use client";

import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

/**
 * Light/dark toggle.
 *
 * The usual next-themes pattern gates rendering on a `mounted` flag set inside an effect, to avoid
 * a hydration mismatch. That is a setState-in-effect cascade, and it also causes a visible pop as
 * the icon appears after hydration.
 *
 * This renders BOTH icons and lets CSS decide which is visible, keyed off the `dark` class that
 * next-themes writes onto <html> before React hydrates. The server and client emit identical
 * markup, so there is no mismatch, no effect, and the correct icon is painted immediately.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      // A label that is accurate in both states, since the markup cannot know which one is active
      // at render time.
      aria-label="Switch between light and dark theme"
      className={cn(
        "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border",
        "text-content-muted transition-colors hover:bg-surface-sunken hover:text-content",
        className,
      )}
    >
      {/* Sun — shown in dark mode, where the action is "switch to light". */}
      <svg
        viewBox="0 0 24 24"
        className="hidden h-5 w-5 dark:block"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4.2" />
        <path
          strokeLinecap="round"
          d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.1 5.1l1.4 1.4M17.5 17.5l1.4 1.4M18.9 5.1l-1.4 1.4M6.5 17.5l-1.4 1.4"
        />
      </svg>

      {/* Moon — shown in light mode. */}
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 dark:hidden"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20 13.4A8.2 8.2 0 1 1 10.6 4a6.6 6.6 0 0 0 9.4 9.4Z"
        />
      </svg>
    </button>
  );
}
