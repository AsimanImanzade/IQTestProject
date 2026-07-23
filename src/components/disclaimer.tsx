import { cn } from "@/lib/utils";
import { getServerT } from "@/i18n/server";

/**
 * The estimate disclaimer.
 *
 * This is the ethical centre of the product, not boilerplate. The score this application produces
 * is a model-based estimate of performance against a procedurally generated item bank whose
 * difficulties are *designed*, not empirically calibrated, and which has never been administered
 * to a standardisation sample. Presenting that as an IQ without qualification would be a false
 * claim about a number people take seriously.
 *
 * It is shown before the test, on the results page, and in the documentation. It is deliberately
 * not dismissible and not hidden behind a link.
 */
export async function Disclaimer({
  variant = "full",
  className,
}: {
  variant?: "full" | "compact";
  className?: string;
}) {
  const { t } = await getServerT();

  if (variant === "compact") {
    return (
      <p className={cn("text-xs leading-relaxed text-content-muted", className)}>
        {t("disclaimer.compact")}
      </p>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[--radius-card] border border-caution/35 bg-caution-soft/50 p-5",
        className,
      )}
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-caution" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 7.5v5.5M12 16.4v.1" />
        </svg>
        {t("disclaimer.heading")}
      </h2>
      <div className="mt-3 space-y-2 text-sm leading-relaxed text-content-muted">
        <p>{t("disclaimer.p1")}</p>
        <p>{t("disclaimer.p2")}</p>
        <p>{t("disclaimer.p3")}</p>
      </div>
    </div>
  );
}
