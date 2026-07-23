import Link from "next/link";
import { cn } from "@/lib/utils";
import { getServerT } from "@/i18n/server";

/**
 * Shown to guests on the results page.
 *
 * Placed *after* the result rather than before the test: the whole point of guest-first testing is
 * that someone sees their score before being asked for anything. Registering claims this attempt
 * onto the new account automatically, so nothing is lost by having started anonymously.
 */
export async function SaveResultPrompt({ className }: { className?: string }) {
  const { t } = await getServerT();
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-4 rounded-[--radius-card] border border-accent/40 bg-accent-soft p-5",
        className,
      )}
    >
      <div>
        <h2 className="text-sm font-semibold">{t("save.title")}</h2>
        <p className="mt-1 text-sm text-content-muted">{t("save.body")}</p>
      </div>

      <div className="flex gap-2">
        <Link
          href="/register"
          className="inline-flex h-11 items-center rounded-xl bg-accent px-5 text-sm font-medium text-accent-content transition-colors hover:bg-accent-hover"
        >
          {t("save.createAccount")}
        </Link>
        <Link
          href="/login"
          className="inline-flex h-11 items-center rounded-xl border border-border bg-surface-raised px-5 text-sm font-medium transition-colors hover:bg-surface-sunken"
        >
          {t("common.signIn")}
        </Link>
      </div>
    </div>
  );
}
