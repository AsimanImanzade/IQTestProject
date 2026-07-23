import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Disclaimer } from "@/components/disclaimer";
import { Card, CardTitle, Stat } from "@/components/ui/card";
import { BarChart, type BarDatum } from "@/components/charts/bar-chart";
import { ScoreScale } from "@/components/charts/score-scale";
import { BandVerdict, Verdict } from "@/components/verdict";
import { ReviewList } from "@/components/results/review-list";
import { SaveResultPrompt } from "@/components/results/save-result-prompt";
import { resolveOwnerForPage } from "@/server/page-helpers";
import { getAttemptResult } from "@/server/services/scoring";
import { AttemptError } from "@/server/services/attempts";
import { getSessionUser } from "@/server/auth/session";
import { formatElapsed, formatPercent, formatPercentile } from "@/lib/utils";
import { getServerT } from "@/i18n/server";

export const metadata: Metadata = {
  title: "Your result",
  robots: { index: false, follow: false },
};

const BAND_LABEL_KEY: Record<string, string> = {
  easy: "results.bandEasy",
  medium: "results.bandMedium",
  hard: "results.bandHard",
  "very-hard": "results.bandVeryHard",
};

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  const owner = await resolveOwnerForPage();
  if (!owner) notFound();

  let result;
  try {
    result = await getAttemptResult(attemptId, owner);
  } catch (error) {
    if (error instanceof AttemptError) {
      if (error.code === "not-submitted") redirect(`/test/${attemptId}`);
      if (error.status === 404) notFound();
    }
    throw error;
  }

  const user = await getSessionUser();
  const { t } = await getServerT();

  const bandName = (band: string): string =>
    band === "ABOVE_AVERAGE" ? t("bands.aboveAverage") : band === "BELOW_AVERAGE" ? t("bands.belowAverage") : t("bands.average");

  const categoryData: BarDatum[] = result.categories.map((category) => ({
    label: t(`categories.${category.slug}`),
    value: category.accuracy,
    display: `${category.correctCount} / ${category.totalCount}`,
    note: bandName(category.band),
  }));

  const difficultyData: BarDatum[] = result.difficultyBreakdown
    .filter((band) => band.totalCount > 0)
    .map((band) => ({
      label: t(BAND_LABEL_KEY[band.band] ?? band.band),
      value: band.accuracy,
      display: `${band.correctCount} / ${band.totalCount}`,
    }));

  const confidenceTone =
    result.confidence === "HIGH" ? "positive" : result.confidence === "MODERATE" ? "neutral" : "caution";

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-4xl px-6 pb-24 pt-10">
        {/* --- headline --- */}
        <Card className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-content-subtle">
            {t("results.estimatedScore")}
          </p>

          <div className="mt-3 flex items-baseline justify-center gap-3">
            <span className="text-6xl font-semibold tracking-tight">{result.iq}</span>
            <span className="text-lg text-content-muted">
              ± {Math.round((result.iqUpper - result.iqLower) / 2)}
            </span>
          </div>

          <p className="mt-2 text-content-muted">
            {t("results.confidenceInterval")}{" "}
            <strong className="font-medium text-content">
              {result.iqLower} – {result.iqUpper}
            </strong>
          </p>

          <ScoreScale
            iq={result.iq}
            lower={result.iqLower}
            upper={result.iqUpper}
            className="mt-6"
          />

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Verdict tone="neutral" label={t(`levels.${result.reasoningLevel}`)} />
            <Verdict
              tone={confidenceTone}
              label={t("results.confidenceLabel", { level: t(`confidence.${result.confidence}`) })}
            />
            {result.rapidGuessing ? <Verdict tone="caution" label={t("results.answeredFast")} /> : null}
            {result.clamped ? <Verdict tone="caution" label={t("results.reportingLimit")} /> : null}
          </div>

          <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-content-muted">
            {t("results.percentileLine", {
              percentile: formatPercentile(result.percentile),
              group: result.ageReference.applied
                ? t("results.peopleAged", { band: result.ageReference.bandLabel ?? "" })
                : t("results.modelledPopulation"),
            })}
          </p>
        </Card>

        {/*
          The age correction is disclosed, never silent. Someone who sees 124 deserves to know it
          came from a raw 100 shifted by an age comparison, and on what basis.
        */}
        {result.ageReference.applied ? (
          <Card className="mt-4">
            <CardTitle>{t("results.ageTitle")}</CardTitle>
            <p className="mt-2 text-sm leading-relaxed text-content-muted">
              {result.ageReference.description}
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat label={t("results.ageRaw")} value={result.iqUnadjusted} hint={t("results.ageRawHint")} />
              <Stat
                label={t("results.ageGroup")}
                value={result.ageReference.bandLabel ?? "—"}
                hint={t("results.ageGroupHint", { age: result.ageReference.ageYears ?? "" })}
              />
              <Stat
                label={t("results.ageReported")}
                value={result.iq}
                hint={
                  result.iq === result.iqUnadjusted
                    ? t("results.ageNoShift")
                    : t("results.ageVsRaw", { delta: `${result.iq > result.iqUnadjusted ? "+" : ""}${result.iq - result.iqUnadjusted}` })
                }
              />
            </div>

            {result.ageReference.source !== "empirical" ? (
              <p className="mt-4 rounded-lg border border-caution/40 bg-caution-soft px-4 py-3 text-sm leading-relaxed">
{t("results.ageModelledWarning")}
              </p>
            ) : null}

            {result.ageReference.cautionYoungAge ? (
              <p className="mt-3 rounded-lg border border-caution/40 bg-caution-soft px-4 py-3 text-sm leading-relaxed">
{t("results.ageYoungWarning")}
              </p>
            ) : null}
          </Card>
        ) : (
          <Card className="mt-4">
            <CardTitle>{t("results.noAgeTitle")}</CardTitle>
            <p className="mt-2 text-sm leading-relaxed text-content-muted">
              {t("results.noAgeBody")}{" "}
              {user ? (
                t("results.noAgeSignedIn", { profile: t("common.profile") })
              ) : (
                t("results.noAgeGuest")
              )}
            </p>
          </Card>
        )}

        {/* --- summary statistics --- */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label={t("results.statAccuracy")}
            value={`${result.correctCount}/${result.totalCount}`}
            hint={formatPercent(result.accuracy)}
          />
          <Stat label={t("results.statPercentile")} value={formatPercentile(result.percentile)} hint={t("results.modelled")} />
          <Stat
            label={t("results.statPerQuestion")}
            value={formatElapsed(result.meanResponseMs)}
            hint={t("results.statTotal", { time: formatElapsed(result.totalDurationMs) })}
          />
          <Stat
            label={t("results.statError")}
            value={`± ${(result.sem * 15).toFixed(1)}`}
            hint={t("results.statReliability", { value: result.reliability.toFixed(2) })}
          />
        </div>

        {result.focusLossCount > 0 ? (
          <p className="mt-4 rounded-xl border border-caution/40 bg-caution-soft px-4 py-3 text-sm">
{t("results.focusLoss", { count: result.focusLossCount })}
          </p>
        ) : null}

        {!user ? <SaveResultPrompt className="mt-4" /> : null}

        {/* --- category performance --- */}
        <Card className="mt-4">
          <CardTitle>{t("results.categoryTitle")}</CardTitle>
          <p className="mt-1 text-sm text-content-muted">
{t("results.categoryBody")}
          </p>
          <BarChart
            data={categoryData}
            caption={t("results.categoryTitle")}
            className="mt-5"
          />

          <ul className="mt-5 flex flex-wrap gap-2">
            {result.categories.map((category) => (
              <li key={category.slug} className="flex items-center gap-2">
                <span className="text-sm text-content-muted">{t(`categories.${category.slug}`)}</span>
                <BandVerdict band={category.band} />
              </li>
            ))}
          </ul>
        </Card>

        {/* --- difficulty --- */}
        <Card className="mt-4">
          <CardTitle>{t("results.difficultyTitle")}</CardTitle>
          <p className="mt-1 text-sm text-content-muted">
{t("results.difficultyBody")}
          </p>
          <BarChart
            data={difficultyData}
            caption={t("results.difficultyTitle")}
            className="mt-5"
          />
        </Card>

        {/* --- narrative --- */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <CardTitle>{t("results.strengthsTitle")}</CardTitle>
            <ul className="mt-3 space-y-2.5">
              {result.strengths.map((strength) => (
                <li key={strength} className="flex gap-2.5 text-sm leading-relaxed">
                  <Verdict tone="positive" label="" className="mt-0.5 h-6 w-6 justify-center px-0" />
                  <span className="text-content-muted">{strength}</span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle>{t("results.focusTitle")}</CardTitle>
            <ul className="mt-3 space-y-2.5">
              {(result.weaknesses.length > 0
                ? result.weaknesses
                : [t("results.noWeakness")]
              ).map((weakness) => (
                <li key={weakness} className="text-sm leading-relaxed text-content-muted">
                  {weakness}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card className="mt-4">
          <CardTitle>{t("results.recommendationsTitle")}</CardTitle>
          <ul className="mt-3 space-y-2.5">
            {result.recommendations.map((recommendation) => (
              <li key={recommendation} className="text-sm leading-relaxed text-content-muted">
                {recommendation}
              </li>
            ))}
          </ul>

          {result.caveats.length > 0 ? (
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">{t("results.caveatsTitle")}</h3>
              <ul className="mt-2 space-y-2">
                {result.caveats.map((caveat) => (
                  <li key={caveat} className="text-sm leading-relaxed text-content-muted">
                    {caveat}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        {/* --- per-question review --- */}
        <ReviewList items={result.review} className="mt-4" />

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex h-12 items-center rounded-xl bg-accent px-6 font-medium text-accent-content transition-colors hover:bg-accent-hover"
          >
            {t("common.takeAnother")}
          </Link>
          {user ? (
            <Link
              href="/dashboard"
              className="inline-flex h-12 items-center rounded-xl border border-border px-6 font-medium transition-colors hover:bg-surface-sunken"
            >
              {t("results.viewDashboard")}
            </Link>
          ) : null}
        </div>

        <Disclaimer className="mt-8" />
      </main>
    </>
  );
}
