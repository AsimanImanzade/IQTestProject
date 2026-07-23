import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { Card, CardTitle, Stat } from "@/components/ui/card";
import { ScoreHistory } from "@/components/charts/score-history";
import { BarChart, type BarDatum } from "@/components/charts/bar-chart";
import { Disclaimer } from "@/components/disclaimer";
import { Verdict } from "@/components/verdict";
import { ComparisonCard } from "@/components/comparison-card";
import { getSessionUser } from "@/server/auth/session";
import { getAttemptHistory, getDashboardStats } from "@/server/services/users";
import { getProfile } from "@/server/services/demographics";
import { formatDate, formatPercent, formatPercentile } from "@/lib/utils";
import { getServerT } from "@/i18n/server";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // The real auth check. proxy.ts only does a cheap cookie-presence redirect; the session is
  // validated against the database here.
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/dashboard");

  const [attempts, stats, profile] = await Promise.all([
    getAttemptHistory(user.id),
    getDashboardStats(user.id),
    getProfile(user.id),
  ]);
  const { t } = await getServerT();

  // Oldest first, so the history chart reads left to right in time order.
  const historyPoints = [...attempts]
    .reverse()
    .map((attempt) => ({
      date: attempt.submittedAt,
      iq: attempt.iq,
      lower: attempt.iqLower,
      upper: attempt.iqUpper,
    }));

  const categoryData: BarDatum[] = stats.categoryPerformance.map((category) => ({
    label: t(`categories.${category.slug}`),
    value: category.accuracy,
    display: formatPercent(category.accuracy),
    note: String(category.totalItems),
  }));

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-4xl px-6 pb-24 pt-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {user.displayName ? t("dashboard.helloName", { name: user.displayName }) : t("dashboard.hello")}
            </h1>
            <p className="mt-1.5 text-content-muted">
              {stats.attemptCount === 0
                ? t("dashboard.noTests")
                : t("dashboard.testCount", { count: stats.attemptCount })}
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex h-12 items-center rounded-xl bg-accent px-6 font-medium text-accent-content transition-colors hover:bg-accent-hover"
          >
            {t("common.takeTest")}
          </Link>
        </header>

        {stats.attemptCount === 0 ? (
          <Card className="mt-8 text-center">
            <CardTitle>{t("dashboard.noResultsTitle")}</CardTitle>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-content-muted">
{t("dashboard.noResultsBody")}
            </p>
          </Card>
        ) : (
          <>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label={t("dashboard.statLatest")} value={stats.latestIq ?? "—"} />
              <Stat label={t("dashboard.statAverage")} value={stats.averageIq ?? "—"} hint={t("dashboard.statAcrossAttempts")} />
              <Stat label={t("dashboard.statBest")} value={stats.bestIq ?? "—"} />
              <Stat
                label={t("dashboard.statChange")}
                value={
                  stats.trend === null
                    ? "—"
                    : `${stats.trend > 0 ? "+" : ""}${stats.trend}`
                }
                hint={stats.trend === null ? t("dashboard.statNeedsTwo") : t("dashboard.statSinceFirst")}
              />
            </div>

            {stats.trend !== null && Math.abs(stats.trend) > 0 ? (
              <p className="mt-3 rounded-xl border border-border bg-surface-raised px-4 py-3 text-sm text-content-muted">
{t("dashboard.trendNote")}
              </p>
            ) : null}

            <Card className="mt-4">
              <CardTitle>{t("dashboard.historyTitle")}</CardTitle>
              <p className="mt-1 text-sm text-content-muted">
{t("dashboard.historyBody")}
              </p>
              <ScoreHistory points={historyPoints} className="mt-5" />
            </Card>

            {/* Reference comparisons — country / profession. Shown only when the user has set the
                relevant profile field and we hold a figure for it. */}
            {stats.countryComparison || stats.professionComparison ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {stats.countryComparison ? (
                  <ComparisonCard
                    title={t("dashboard.countryTitle")}
                    comparison={stats.countryComparison}
                  />
                ) : null}
                {stats.professionComparison ? (
                  <ComparisonCard
                    title={t("dashboard.professionTitle")}
                    comparison={stats.professionComparison}
                  />
                ) : null}
              </div>
            ) : null}

            {!profile.nationality || !profile.profession ? (
              <div className="mt-4 rounded-[--radius-card] border border-border bg-surface-raised px-5 py-4 text-sm text-content-muted">
                {t("dashboard.comparePrompt", {
                  fields:
                    !profile.nationality && !profile.profession
                      ? t("dashboard.fieldCountryAndProfession")
                      : !profile.nationality
                        ? t("dashboard.fieldCountry")
                        : t("dashboard.fieldProfession"),
                })}{" "}
                <Link href="/profile" className="font-medium text-accent hover:underline">
                  {t("common.profile")}
                </Link>
              </div>
            ) : null}

            {categoryData.length > 0 ? (
              <Card className="mt-4">
                <CardTitle>{t("dashboard.categoryTitle")}</CardTitle>
                <p className="mt-1 text-sm text-content-muted">
{t("dashboard.categoryBody")}
                </p>
                <BarChart
                  data={categoryData}
                  caption={t("dashboard.categoryTitle")}
                  className="mt-5"
                />
              </Card>
            ) : null}

            <Card className="mt-4">
              <CardTitle>{t("dashboard.pastTitle")}</CardTitle>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-content-subtle">
                      <th scope="col" className="pb-2 font-medium">{t("dashboard.colDate")}</th>
                      <th scope="col" className="pb-2 font-medium">{t("dashboard.colMode")}</th>
                      <th scope="col" className="pb-2 font-medium">{t("dashboard.colScore")}</th>
                      <th scope="col" className="pb-2 font-medium">{t("dashboard.colPercentile")}</th>
                      <th scope="col" className="pb-2 font-medium">{t("dashboard.colCorrect")}</th>
                      <th scope="col" className="pb-2 font-medium">{t("dashboard.colConfidence")}</th>
                      <th scope="col" className="pb-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {attempts.map((attempt) => (
                      <tr key={attempt.id} className="border-b border-border last:border-0">
                        <td className="py-3">{formatDate(attempt.submittedAt)}</td>
                        <td className="py-3 text-content-muted">
                          {attempt.mode === "TIMED" ? t("dashboard.timed") : t("dashboard.untimed")}
                        </td>
                        <td className="py-3 font-medium tabular-nums">
                          {attempt.iq}
                          <span className="ml-1 text-xs font-normal text-content-subtle">
                            ({attempt.iqLower}–{attempt.iqUpper})
                          </span>
                        </td>
                        <td className="py-3 tabular-nums text-content-muted">
                          {formatPercentile(attempt.percentile)}
                        </td>
                        <td className="py-3 tabular-nums text-content-muted">
                          {attempt.correctCount}/{attempt.totalCount}
                        </td>
                        <td className="py-3">
                          <Verdict
                            tone={
                              attempt.rapidGuessing || attempt.confidence === "LOW"
                                ? "caution"
                                : attempt.confidence === "HIGH"
                                  ? "positive"
                                  : "neutral"
                            }
                            label={
                              attempt.rapidGuessing
                                ? t("dashboard.rushed")
                                : t(`confidence.${attempt.confidence}`)
                            }
                          />
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            href={`/results/${attempt.id}`}
                            className="font-medium text-accent hover:underline"
                          >
                            {t("dashboard.view")}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        <Disclaimer variant="compact" className="mt-8" />
      </main>
    </>
  );
}
