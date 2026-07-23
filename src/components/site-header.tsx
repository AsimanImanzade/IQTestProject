import Link from "next/link";
import { getSessionUser } from "@/server/auth/session";
import { getServerT } from "@/i18n/server";
import { ThemeToggle } from "./theme-toggle";
import { SignOutButton } from "./sign-out-button";
import { LanguageSwitcher } from "./language-switcher";

export async function SiteHeader() {
  const user = await getSessionUser();
  const { t } = await getServerT();

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
            <rect x="3" y="3" width="7.5" height="7.5" rx="1.6" />
            <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6" />
            <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6" />
            <circle cx="17.25" cy="17.25" r="3.75" />
          </svg>
          <span className="hidden sm:inline">{t("common.appName")}</span>
          <span className="sm:hidden">{t("common.appShort")}</span>
        </Link>

        <nav className="flex items-center gap-2">
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="hidden rounded-xl px-4 py-2.5 text-sm font-medium text-content-muted transition-colors hover:bg-surface-sunken hover:text-content sm:inline-block"
              >
                {t("common.dashboard")}
              </Link>
              <SignOutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-content-muted transition-colors hover:bg-surface-sunken hover:text-content"
            >
              {t("common.signIn")}
            </Link>
          )}
          <LanguageSwitcher />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
