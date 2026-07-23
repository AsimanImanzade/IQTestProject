# Psychometric methodology

This document states exactly how the score is produced, what it supports, and what it does not.
It is written to be checkable, not reassuring.

---

## 1. The headline caveat

**This instrument has never been administered to a standardisation sample.**

Everything below is a defensible measurement model applied to an item bank whose difficulties were
*assigned by design* rather than *estimated from responses*. The conversion to the familiar
100-point scale assumes ability is standard normal in the population, which is the definition of
the IQ scale — not a finding about this test's users.

Concretely, the score supports statements like:

- "This person answered a blueprint-controlled set of reasoning items at a level the model places
  around 112, and the test cannot distinguish that from anything between 95 and 129."

and does **not** support:

- "This person's IQ is 112."
- Any comparison against a clinical instrument (WAIS, Stanford-Binet, Raven's APM).
- Any decision about a person — selection, diagnosis, placement.

The application states this before the test, on the results page, and in the README. It is not
dismissible and it is not hidden behind a link.

---

## 2. Item response model

A **3-parameter logistic** model:

```
P(correct | θ) = c + (1 − c) / (1 + exp(−a(θ − b)))
```

| Parameter | Meaning | How it is set here |
|---|---|---|
| `a` | discrimination | Fixed at **1.0** for every item |
| `b` | difficulty on the ability scale | `(designed_difficulty − 5.5) × 0.55`, spanning ≈ ±2.5 logits |
| `c` | pseudo-guessing | **1/k** for a k-option item: 0.25 for four options, 0.20 for five |

### Why 3PL and not 2PL

Every item is multiple choice, so guessing is real. A 2PL model implicitly asserts that someone
with very low ability has a near-zero chance of answering correctly, which is false when there are
four options. Ignoring `c` systematically **over-estimates low-ability test-takers**, because their
lucky guesses are read as evidence of ability.

This is also why harder items get five options rather than four: it lowers the guessing floor from
0.25 to 0.20 exactly where the test is trying to discriminate.

### Why discrimination is fixed at 1.0

Because there is no calibration sample. Assigning per-item discriminations without response data
would be fabrication dressed as precision. A neutral constant is the honest prior, and
`ItemStatistic` accumulates the point-biserial correlations needed to replace it later.

---

## 3. Ability estimation

**Expected a posteriori (EAP)** over an 81-node quadrature grid on θ ∈ [−4, 4], with a standard
normal prior.

### Why not maximum likelihood

With 20 items, all-correct and all-wrong response patterns are not edge cases — they occur. The
likelihood for either is monotonic, so the MLE diverges to ±∞ and there is no finite standard error
to report. EAP always returns a finite estimate together with the posterior standard deviation,
which is the standard error the confidence interval needs.

The cost is **shrinkage**: extreme scores are pulled toward the mean. That is not a defect to be
corrected. A 20-item test genuinely cannot justify an extreme claim, and shrinkage is the model
declining to make one.

Numerically, the log-likelihood is accumulated and the log-sum-exp trick applied before
exponentiating; with 20 items the raw likelihood product underflows to zero for poorly-fitting
abilities, which would silently distort the posterior.

---

## 4. Reported values

| Output | Computation |
|---|---|
| Score | `100 + 15·θ̂`, clamped to **[55, 145]** |
| 95% interval | `θ̂ ± 1.96·SEM`, converted and clamped |
| Percentile | `Φ(θ̂) × 100`, never reported as exactly 0 or 100 |
| Confidence | SEM < 0.30 High · 0.30–0.45 Moderate · > 0.45 Low |
| Reliability | `1 − SEM²` (marginal, relative to the unit prior) |

The clamp is a reporting decision, not arithmetic convenience: the standard error of a 20-item
test is around 0.35 logits at best, so distinguishing 150 from 160 would be indefensible. Scores at
the boundary are labelled as such.

**The interval is displayed next to the point estimate everywhere the score appears.** A single
number invites the reader to treat it as exact.

---

## 5. Age referencing

A raw ability estimate answers *"how well did this person reason on these items?"*. An IQ-scale
score answers a different question: *"how does this person compare with others of their age?"*.
Those come apart sharply at the ends of the lifespan — a 13-year-old and a 25-year-old who answer
identically have not demonstrated the same thing. Reporting them as equal would be wrong, which is
why every serious instrument norms by age. That is what "deviation IQ" means.

The measured ability is therefore shifted by the expected ability of the test-taker's age group
before it becomes a score:

```
θ_adjusted = θ_measured − expectedθ(age)
score      = 100 + 15 · θ_adjusted
```

The reference group is ages **20–29, fixed at 0**, because the item difficulties were designed with
a general adult audience in mind. Adolescent bands sit below it and older bands sit progressively
below it again, following the well-replicated shape of fluid reasoning across the lifespan.

### What this costs, stated plainly

**The age curve is modelled, not measured on this instrument.** A proper age norm requires
administering the test to a large representative sample in each band and recording what "average"
actually looks like there. No such sample exists here. The table in
`src/core/psychometrics/age-norms.ts` is an informed approximation of a well-established pattern —
not a measurement of this item bank.

Four safeguards are enforced in code rather than left to good intentions:

1. **The unadjusted score is always computed, stored and displayed.** `iqUnadjusted` and `theta`
   preserve exactly what was observed, so the correction can never hide the measurement.
2. **Every result records its `normSource`.** While the modelled table is in use, the results page
   says so in plain language.
3. **The table is replaceable.** `EMPIRICAL_NORMS` is consulted first and is deliberately empty;
   once a band accumulates `MIN_SAMPLE_FOR_EMPIRICAL_NORM` (100) real attempts, a measured value
   can be dropped in and it takes precedence automatically.
4. **Corrections are bounded.** A unit test fails if any band exceeds ±2 logits, so the curve
   cannot quietly grow into something that moves scores by more than the evidence supports.

Only the **location** is shifted, not the scale. A full deviation score also divides by the age
group's standard deviation, but that dispersion has not been measured here and inventing one would
stack a second assumption on the first for no gain in accuracy.

### Supported ages

Ages **12–100**. Below 12 the bank's reading load makes a score uninterpretable and the test
refuses to score at all. Between 12 and 16 the result carries an extra caveat: several item types —
verbal analogies especially — assume adult vocabulary, so a low score there may reflect word
knowledge rather than reasoning.

An attempt with no age is scored without adjustment and labelled as such.

### Country and profession comparisons (signed-in users only)

Signed-in users may record their country and profession on their profile. The dashboard then shows
how their score sits against a **published reference average** for each. This is a display feature
only — **neither ever touches the scoring engine**, exactly like gender and education. It is not
offered to guests.

These comparisons use *external* data and come with three limitations that the dashboard states
next to every figure:

1. **Different instrument.** The reference numbers come from other tests, not this one, so they are
   not on the same calibrated scale as the score. The difference is indicative, not exact. For
   countries we deliberately use the *International IQ Test* online aggregate as the source,
   because — like this app — it is an online self-selected test centred near 100, making it the
   least-mismatched reference available rather than a rigorous one.
2. **Self-selected samples.** Both the reference figures and (were we to use them) our own users
   are whoever chose to take an online test, not a representative national or occupational sample.
   The wording is always "the average among people who took a test," never "the IQ of a nation."
3. **Weak profession data.** The occupational figures trace to Harrell & Harrell (1945) US Army
   data plus later Wonderlic aggregates — old, US-centric, and dominated by within-profession
   variation that exceeds the differences between professions. Shown as a curiosity, captioned as
   such.

The figures live in `src/core/reference/` as sourced tables (stored as whole integers to avoid
implying false precision), and the app builds no country ranking or leaderboard — only the
individual's own score against their own group.

### Gender and education

Collected; **never used in any calculation**. Two identical answer sheets always produce identical
scores.

This is deliberate and matches standard practice. Major instruments do not apply gender
corrections — they do the opposite, running differential-item-functioning analysis to *remove*
gender bias from items. A gender-based score adjustment would also be discriminatory in any
selection context. Education is recorded as descriptive context only.

The `ScoreOptions` type accepts exactly one field, `ageYears`, and a unit test asserts the shape of
the age reference so that adding a demographic input to the scorer breaks the build and forces a
deliberate decision.

---

## 6. Category subscores

Reported as three wide bands — Below average / Average / Above average — never as per-category
scores.

With 20 items over 7 categories, each category carries 2–4 items. The standard error of an ability
estimate from three items is roughly 0.8 logits, about ±24 points at 95%. Printing "Spatial
reasoning: 112" from that would be a fabrication with a decimal point on it.

Band thresholds sit at ±0.5 logits — deliberately inside a single category's standard error, so a
category is only labelled when the posterior has moved appreciably. The insights engine refuses to
characterise any category with fewer than 3 items, and says so in the caveats.

---

## 7. Response validity

**Rapid guessing detection.** An attempt is flagged when the median response time is under 2
seconds, or more than 30% of items are answered in under 3 seconds — below the time needed to read
even the shortest stem. A flagged attempt has its confidence forced to LOW and is annotated,
because the model has fitted a response process that was not about ability.

**Unanswered items count as incorrect.** Skipping is information about ability; omitting skipped
items would inflate the estimate of anyone who answered only what they found easy.

**Aberrant patterns are not rewarded.** A test-taker who fails every easy item but passes hard ones
scores *lower* than a conventional pattern with the same raw score. Under 3PL those hard successes
are well explained by guessing, while the easy failures are improbable at any competent ability.
This is asserted by a unit test, and it is what stops the test being gamed by deliberately skipping
easy items.

---

## 8. Test assembly

Fixed difficulty profile — **4 easy · 8 medium · 6 hard · 2 very hard**.

A blueprint is what separates a test from a pile of random questions. Without one, two people
taking "the same" test could receive very different difficulty mixes, and their scores would not be
comparable even though both are expressed on the same scale. Fixing the profile means the only
thing that varies between test-takers is *which* items they see, not *how hard* the test was.

The centre-weighting is deliberate: test information peaks near an item's difficulty, so
concentrating items in the middle maximises precision for most test-takers while the tails preserve
the ability to discriminate at the extremes.

Category rules: at least 3 items from each of the six core domains, one rotating supporting
category, 7 categories total, no category exceeding 4 items, and **no category appearing fewer than
2 times** — a single-item category costs a slot and supports no inference.

---

## 9. Path to genuine calibration

`ItemStatistic` accumulates on every submission: exposures, correct count, classical p-value,
point-biserial discrimination, mean response time, and the running sums needed to compute them
incrementally.

With a few hundred responses per item, that supports:

1. Replacing designed `b` with empirically estimated difficulty.
2. Replacing the constant `a` with estimated discrimination, and retiring items whose
   point-biserial is near zero or negative — those fail to separate stronger from weaker
   test-takers and are actively harmful to the estimate.
3. Differential item functioning analysis across demographic groups.
4. A norming study, which is the only thing that would make the 100-point conversion an empirical
   claim rather than a modelled one.

Until at least (1) and (2) are done, the score remains an estimate against this item bank, and the
application will keep saying so.

---

## 10. References

- Lord, F. M. (1980). *Applications of Item Response Theory to Practical Testing Problems.*
- Baker, F. B., & Kim, S.-H. (2004). *Item Response Theory: Parameter Estimation Techniques.*
- Bock, R. D., & Mislevy, R. J. (1982). Adaptive EAP estimation of ability in a microcomputer
  environment. *Applied Psychological Measurement, 6*(4).
- Wise, S. L., & Kong, X. (2005). Response time effort: a new measure of examinee motivation.
  *Applied Measurement in Education, 18*(2).
- AERA, APA & NCME (2014). *Standards for Educational and Psychological Testing.*
