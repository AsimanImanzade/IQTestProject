import { SiteHeader } from "@/components/site-header";
import { Disclaimer } from "@/components/disclaimer";
import { StartTestPanel } from "@/components/start-test-panel";
import { countPublishedQuestions } from "@/server/repositories/questions";
import { TEST_LENGTH } from "@/core/blueprint/blueprint";
import { CATEGORIES } from "@/core/types";
import { getSessionUser } from "@/server/auth/session";
import { getProfile } from "@/server/services/demographics";
import { getServerT } from "@/i18n/server";

/**
 * Rendered per request rather than prerendered.
 *
 * The page reports the live bank size and the header reflects the current session, neither of
 * which can be baked in at build time — and a Docker image is built with no database reachable at
 * all, so any attempt to prerender this page fails the build.
 */
export const dynamic = "force-dynamic";

/**
 * Fallback used when the bank size cannot be read. The landing page is the most public surface in
 * the application; a transient database problem should degrade the copy, not return a 500.
 */
async function getBankSize(): Promise<number | null> {
  try {
    return await countPublishedQuestions();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const bankSize = await getBankSize();
  const { t } = await getServerT();
  const bankSizeLabel = bankSize === null ? "…" : bankSize.toLocaleString();

  // A signed-in person's profile supplies their age, so they are not asked again before each
  // test; a guest is.
  const user = await getSessionUser();
  const profile = user ? await getProfile(user.id) : null;

  const features = [
    { title: t("home.feature1Title"), body: t("home.feature1Body", { bank: bankSizeLabel }) },
    { title: t("home.feature2Title"), body: t("home.feature2Body") },
    { title: t("home.feature3Title"), body: t("home.feature3Body", { categories: CATEGORIES.length }) },
  ];

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto max-w-4xl px-6 pb-24 pt-14">
        <section className="text-center">
          <p className="text-sm font-medium uppercase tracking-[0.14em] text-accent">
            {t("home.kicker")}
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            {t("home.title")}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-content-muted">
            {t("home.subtitle", { count: TEST_LENGTH, bank: bankSizeLabel })}
          </p>
        </section>

        <StartTestPanel
          user={{ signedIn: Boolean(user), ageYears: profile?.ageYears ?? null }}
          className="mt-12"
        />

        <section className="mt-14 grid gap-4 sm:grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="rounded-[--radius-card] border border-border bg-surface-raised p-5">
              <h2 className="text-sm font-semibold">{feature.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-content-muted">{feature.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-content-subtle">
            {t("home.whatIsAssessed")}
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {CATEGORIES.map((category) => (
              <li
                key={category.slug}
                className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-content-muted"
              >
                {t(`categories.${category.slug}`)}
                {category.isCore ? (
                  <span className="ml-1.5 text-xs text-accent" aria-hidden="true">
                    ●
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-content-subtle">
            <span className="text-accent">●</span> {t("home.coreLegend")}
          </p>
        </section>

        <Disclaimer className="mt-12" />
      </main>
    </>
  );
}
