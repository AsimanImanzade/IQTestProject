# Cognitive Reasoning Assessment

A production-ready reasoning assessment platform. Every user receives a unique 20-question test
assembled to a fixed psychometric blueprint from a large procedurally generated bank, and the
result is produced by a 3-parameter item response theory model rather than a raw score.

> **What the score is.** An *estimate of reasoning ability measured against this item bank*,
> reported with a confidence interval. It is **not** a clinically administered or professionally
> normed IQ test — the item difficulties are designed rather than calibrated, and no
> standardisation sample exists. See [`docs/psychometrics.md`](docs/psychometrics.md) for exactly
> what the number means and does not mean.

---

## Quick start

Requires **Node 20.9+** (24 recommended) and **Docker**.

```bash
git clone <repo> && cd IQ-Test-App
cp .env.example .env                 # then set SESSION_SECRET (see below)
npm install
npm run db:up                        # Postgres 16 on port 5433
npm run db:migrate                   # migrate deploy + prisma generate
npm run db:seed                      # generates and validates 600 questions
npm run dev                          # http://localhost:3000
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Port 5433 is deliberate — it avoids colliding with a Postgres already running on 5432.

### Everything in one container

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 16)" >> .env
echo "SESSION_SECRET=$(openssl rand -hex 32)"   >> .env
docker compose -f docker-compose.prod.yml up --build
```

The stack migrates and seeds before the app accepts traffic, and `/api/health` reports unhealthy
until the bank is large enough to assemble a test.

---

## What makes this different from a quiz

**The answer is computed, never authored.** Every generator ships a solver: a number series is
continued by re-running its own rule, a rotated shape is produced by a real affine transform, a
syllogism's conclusion is verified by enumerating finite models. An item whose answer cannot be
re-derived from its own specification fails validation and is discarded. That is why a 600-item
bank can be trusted without a human checking 600 questions.

**Distractors come from named reasoning errors.** Each wrong option records the specific mistake
that produces it — "applied the row rule but ignored the column rule", "this is the mirror image,
not a rotation" — and the review screen shows that explanation. Randomly perturbed options are
dismissible on sight and measure nothing.

**Uniqueness is structural.** Choosing 20 items from 600 under the blueprint constraints yields on
the order of 10³⁷ distinct tests before question and option order are shuffled.

**Scoring uses the whole response pattern.** A 3PL IRT model with EAP estimation, accounting for
multiple-choice guessing, producing an ability estimate *and* the standard error that goes with it.

**Scores are referenced to the test-taker's age.** A 13-year-old and a 25-year-old who answer
identically have not demonstrated the same thing, so the measured ability is compared against the
expected ability of the person's own age group before it becomes a score — the same principle as
"deviation IQ". The age curve is *modelled*, not measured on this bank, so the unadjusted score is
always computed, stored and shown alongside the adjusted one, and the results page says which norm
source was used. Gender and education are collected but **never** enter any calculation.

---

## Architecture

```
src/
  core/          PURE domain — no react, no next, no database client
    generation/  RNG · attribute/SVG engine · 6 generator modules · validator
    psychometrics/ 3PL model · EAP estimator · score reporting · insights
    blueprint/   test specification · constrained sampler
  server/        repositories · services · auth · rate limiting
  app/           App Router pages and API routes
  components/    presentational only
```

**The rule that holds it together:** nothing under `src/core/**` imports from `next`, `react`, or
the Prisma client — enforced by an ESLint rule, not just convention. That is what makes the scoring
engine and all twelve question categories testable without a browser or a database, and it is why
the unit suite runs in about six seconds.

### Twelve categories from six generator modules

| Module | Categories |
|---|---|
| `figural.ts` | matrix reasoning, pattern recognition, visual sequences, figural analogies, classification, odd one out |
| `series.ts` | number series, quantitative reasoning |
| `spatial.ts` | shape rotation, spatial reasoning (paper folding, grid overlay) |
| `logic.ts` | deductive logic (syllogisms, knights & knaves), logical reasoning (ordering, conditionals) |
| `verbal.ts` | verbal analogies |
| `svg/` | shared attribute space and deterministic renderer |

The first six categories are one engine over a shared attribute space (`{shape, fill, size,
rotation, count}`) under different rule sets. Figures are computed geometry rendered as inline SVG
in `currentColor` — no image files, correct in both themes, and **colour is never an attribute**, so
no item can be solvable only by distinguishing hues.

### Demographics

Guests are asked for their age at the start of each test; signed-in users state a birth year once
on their profile and every attempt snapshots the age they were on the day — so a birthday never
retroactively changes a completed result. A signed-in user's profile is authoritative, and
demographics sent in the request are ignored for them, otherwise a crafted request could score an
attempt against an age the person never claimed.

Supported ages are **12–100**; below 12 the bank's reading load makes a score uninterpretable and
scoring is refused. Between 12 and 16 the result carries a vocabulary caveat.

Signed-in users can additionally record **country** and **profession** on their profile. The
dashboard then shows how their score compares with a published reference average for each. This is
display only — like gender and education, neither touches the scoring engine — and it is not shown
to guests. The reference figures are external, on a different scale, and shown with visible sources
and caveats (`src/core/reference/`); the app builds no country ranking, only the individual's own
score against their own group.

### Localization (English + Azerbaijani)

The whole application is bilingual — **interface and questions**. A language switcher in the header
works for guests and signed-in users alike; the choice lives in a cookie (so guests keep it) and is
mirrored onto a signed-in user's profile.

Question content is genuinely translated, not machine-rendered. Every generator emits a
`LocalizedString` (`{ en, az }`) for each stem, option, explanation and distractor rationale, built
from the same computed data — so the answer is still correct by construction in both languages. The
figural categories are language-neutral (geometry); the verbal analogies use a **separate,
hand-authored Azerbaijani word corpus**, because a synonym pair in one language is not one in
another.

Each question row stores the English text in a plain column and the translations in a companion
JSON column, plus a `locales` array of the languages it is *fully* available in; the sampler filters
the pool by the requested language, and delivery falls back to English per-string if a translation
is ever missing. An attempt records the language it was taken in, so its result and review always
render in that language.

> The Azerbaijani question content should have a **native-speaker review** before public launch —
> a subtle grammar slip in a reasoning item can make it ambiguous.

### Test blueprint

Every test: **4 easy · 8 medium · 6 hard · 2 very hard**, spanning **7 categories** — all six core
domains with at least 3 items each, plus one rotating supporting category.

The distinct-category ceiling matters as much as the floor. Spreading 20 items across all twelve
categories leaves one or two each, and the results page can then only report "too few questions to
comment on" for every domain. Concentrating is what makes the per-category feedback real.

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `start` | Production build and serve |
| `npm run db:up` / `db:down` | Postgres container |
| `npm run db:migrate` | `migrate deploy` + `prisma generate` |
| `npm run db:seed` | Generate, validate and load the bank |
| `npm run db:reset` | Drop, re-migrate, re-seed |
| `npm run bank:validate` | Regenerate the bank in memory and check it — no database needed |
| `npm run test:unit` | Pure-core tests (fast) |
| `npm run test:db:setup` | Prepare the integration database |
| `npm run test:integration` | API and persistence tests against real Postgres |
| `npm run typecheck` / `lint` | Static checks |

Scale the bank by changing one variable — the generators are loops:

```bash
SEED_COUNT=10000 npm run db:seed
```

---

## Testing

**203 automated tests plus end-to-end smoke checks**, split by what they can prove:

- **Unit (152)** — 3PL probabilities against hand-computed values; EAP parameter recovery from
  simulated responses at known ability; every generator solver round-tripped over hundreds of
  seeds; SVG determinism and viewBox containment; blueprint constraints across 300 independent
  draws; age referencing, including that identical answers give a 13-year-old a higher score than a
  22-year-old while leaving the underlying measurement untouched.
- **Integration (51)** — against real Postgres: attempt lifecycle, ownership isolation, deadline
  enforcement, guest-attempt claiming, database CHECK constraints, and the single most important
  assertion in the suite: **the delivered payload contains no `isCorrect` anywhere**.

Two properties worth calling out, because they are easy to get backwards:

- *An aberrant pattern is not rewarded.* Failing every easy item while passing hard ones scores
  **lower** than the conventional pattern with the same raw score — under a 3PL model those hard
  successes are explained by guessing, while the easy failures are improbable at any real ability.
  This is what stops the test being gamed by skipping easy questions.
- *All-correct and all-wrong stay finite.* Maximum likelihood diverges to ±∞ on both, which is
  precisely why the estimator is Bayesian.

---

## Security

- **Argon2id** password hashing (OWASP parameters), with a dummy-hash comparison on the login path
  so response timing cannot be used to enumerate registered accounts
- **Server-side sessions**, not JWTs — a stateless token cannot be revoked, and the specification
  requires preventing multiple simultaneous sessions. Only the SHA-256 hash of each token is stored
- **Grading is server-only.** The answer key never reaches the client before submission, and saving
  an answer deliberately does not reveal whether it was correct — otherwise the API becomes an
  oracle that can be queried option by option
- **Server-authoritative timer.** The browser countdown is cosmetic; the deadline is fixed at
  attempt creation and enforced server-side
- Zod validation at every route boundary · Prisma parameterisation · CSP and security headers ·
  same-origin checks · sliding-window rate limiting (strictest on login)
- Database CHECK constraints and partial unique indexes enforce the domain rules the application
  also enforces — one live attempt per person, exactly one owner per attempt, difficulty in range

---

## Accessibility

Targets WCAG 2.2 AA.

- Options are a real `radiogroup`; the progress bar, flag toggle and timer carry proper ARIA
- Full keyboard operation: `1`–`5` select, `←`/`→` navigate, `F` flag, `Ctrl+Enter` submit
- Every generated figure carries `role="img"` and a descriptive `aria-label`
- Charts are hand-built SVG with an equivalent `<table>` for screen readers, and are never
  colour-only — the palette was validated with a CVD checker rather than chosen by eye
- Status colours always ship with **an icon and a text label**: the positive/negative pair measures
  ΔE ≈ 4 under deuteranopia, so colour alone would be unreadable for roughly one in twelve men
- `prefers-reduced-motion` is honoured on every transition
- 44px minimum touch targets

---

## Deployment

**Vercel + Neon/Supabase:** set `DATABASE_URL` and `SESSION_SECRET`, then run
`npx prisma migrate deploy && npx tsx prisma/seed.ts` as the release command.

**Self-hosted:** `docker compose -f docker-compose.prod.yml up --build`.

The rate limiter is in-memory, which is correct for a single instance and honest about its limits:
across N instances the effective limit is N times higher. The interface is the one a Redis
implementation would expose, so swapping the store touches only `src/server/ratelimit.ts`.

---

## Scope

**Built:** question bank and generators, IRT scoring, age referencing, demographic capture and user
profile (including country/profession reference comparisons), blueprint assembly, full test flow
(timed and untimed, flagging, resume, keyboard operation), results with per-question review,
guest-first auth, dashboard, tests, Docker, CI, docs.

**Deliberately not built yet:** admin panel, CSV import/export and item-statistics dashboards
(Phase 2); PWA, i18n, PDF certificate, leaderboard, achievements, email reports (Phase 3).

The schema already carries what Phase 2 needs — `ItemStatistic` accumulates exposures, p-values,
point-biserial discrimination and response times on every submission, which is what makes genuine
empirical recalibration possible once real response data exists. Nothing reads it for scoring today,
and the application says so rather than implying the bank is calibrated.
