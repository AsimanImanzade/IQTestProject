import { prisma } from "../db";
import { getQuestionsWithChoices, pickLocalized } from "../repositories/questions";
import { AttemptError, type AttemptOwner } from "./attempts";
import { scoreAttempt } from "@/core/psychometrics/scoring";
import { scoreCategories } from "@/core/psychometrics/categories";
import { buildInsights } from "@/core/psychometrics/insights";
import { describeAgeReference } from "@/core/psychometrics/age-norms";
import { normaliseLocale } from "@/core/i18n";
import type { CategorySlug, ScoredResponse } from "@/core/types";
import type { AbilityBand, ConfidenceLevel } from "@/generated/prisma/enums";

/**
 * Submission and scoring.
 *
 * Scoring is done entirely from stored responses and stored item parameters — nothing the client
 * sends at submission time influences the score. An attacker who forges a submission payload
 * changes nothing, because there is nothing in it to change.
 */

export interface AttemptResult {
  attemptId: string;
  submittedAt: string;
  mode: string;

  iq: number;
  /** Score before age referencing. Always sent, so the correction is never hidden. */
  iqUnadjusted: number;
  iqLower: number;
  iqUpper: number;
  percentile: number;
  confidence: ConfidenceLevel;
  reasoningLevel: string;
  reliability: number;
  theta: number;
  thetaAdjusted: number;
  sem: number;
  clamped: boolean;

  /** How the score was referenced against the test-taker's age group. */
  ageReference: {
    applied: boolean;
    ageYears: number | null;
    bandLabel: string | null;
    source: string;
    /** Set when the test-taker is young enough that vocabulary may confound the result. */
    cautionYoungAge: boolean;
    /** Plain-language explanation shown on the result page. */
    description: string | null;
  };

  demographics: {
    ageYears: number | null;
    gender: string | null;
    educationLevel: string | null;
  };

  correctCount: number;
  totalCount: number;
  accuracy: number;
  meanResponseMs: number;
  totalDurationMs: number;

  rapidGuessing: boolean;
  focusLossCount: number;

  categories: {
    slug: string;
    name: string;
    band: AbilityBand;
    correctCount: number;
    totalCount: number;
    accuracy: number;
    meanResponseMs: number;
  }[];

  difficultyBreakdown: { band: string; correctCount: number; totalCount: number; accuracy: number }[];
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  caveats: string[];

  review: ReviewItem[];
}

export interface ReviewItem {
  position: number;
  questionId: string;
  category: string;
  difficulty: number;
  stem: string;
  svg: string | null;
  explanation: string;
  selectedChoiceId: string | null;
  correctChoiceId: string;
  wasCorrect: boolean;
  responseMs: number;
  flagged: boolean;
  choices: {
    id: string;
    text: string | null;
    svg: string | null;
    isCorrect: boolean;
    rationale: string | null;
    wasSelected: boolean;
  }[];
}

/**
 * Submit an attempt and compute its score.
 *
 * Idempotent: submitting an already-submitted attempt returns the stored result rather than
 * rescoring, so a double-click or a retried request cannot produce two different scores.
 */
export async function submitAttempt(
  attemptId: string,
  owner: AttemptOwner,
): Promise<AttemptResult> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: { id: true, userId: true, guestKey: true, status: true, ageYears: true },
  });

  if (!attempt) throw new AttemptError("not-found", "Attempt not found.", 404);

  const owned =
    (owner.userId && attempt.userId === owner.userId) ||
    (owner.guestKey && attempt.guestKey === owner.guestKey);
  if (!owned) throw new AttemptError("not-found", "Attempt not found.", 404);

  if (attempt.status === "SUBMITTED") {
    return getAttemptResult(attemptId, owner);
  }

  const items = await prisma.attemptItem.findMany({
    where: { attemptId },
    orderBy: { position: "asc" },
    select: {
      questionId: true,
      position: true,
      response: { select: { selectedChoiceId: true, isCorrect: true, responseMs: true, flagged: true } },
    },
  });

  const questions = await getQuestionsWithChoices(items.map((i) => i.questionId));
  const byId = new Map(questions.map((q) => [q.id, q]));

  // Unanswered questions count as incorrect. That is the honest treatment: skipping is
  // information about ability, and omitting them would inflate the estimate of anyone who
  // answered only what they found easy.
  const scored: ScoredResponse[] = items.map((item) => {
    const question = byId.get(item.questionId);
    if (!question) {
      throw new AttemptError("missing-question", "A delivered question no longer exists.", 500);
    }
    return {
      category: question.category.slug as CategorySlug,
      parameters: { a: question.irtA, b: question.irtB, c: question.irtC },
      correct: item.response?.isCorrect ?? false,
      responseMs: item.response?.responseMs ?? 0,
    };
  });

  // The age recorded on the attempt, not the person's age today — a result must not drift as
  // the test-taker gets older.
  const score = scoreAttempt(scored, { ageYears: attempt.ageYears });
  const categories = scoreCategories(scored);

  const submittedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.attempt.update({
      where: { id: attemptId },
      data: {
        status: "SUBMITTED",
        submittedAt,
        theta: score.theta,
        thetaAdjusted: score.thetaAdjusted,
        sem: score.sem,
        iqScore: score.iq,
        iqUnadjusted: score.iqUnadjusted,
        iqLower: score.iqLower,
        iqUpper: score.iqUpper,
        normSource: score.ageReference.applied ? score.ageReference.source : null,
        percentile: score.percentile,
        confidence: score.confidence,
        reliability: score.reliability,
        correctCount: score.correctCount,
        totalCount: score.totalCount,
        rapidGuessing: score.rapidGuessing.detected,
      },
    });

    const categoryRows = await tx.category.findMany({ select: { id: true, slug: true } });
    const categoryIdBySlug = new Map(categoryRows.map((c) => [c.slug, c.id]));

    for (const result of categories) {
      const categoryId = categoryIdBySlug.get(result.category);
      if (!categoryId) continue;
      await tx.categoryScore.upsert({
        where: { attemptId_categoryId: { attemptId, categoryId } },
        create: {
          attemptId,
          categoryId,
          theta: result.theta,
          sem: result.sem,
          band: result.band,
          correctCount: result.correctCount,
          totalCount: result.totalCount,
          meanResponseMs: result.meanResponseMs,
        },
        update: {
          theta: result.theta,
          sem: result.sem,
          band: result.band,
          correctCount: result.correctCount,
          totalCount: result.totalCount,
          meanResponseMs: result.meanResponseMs,
        },
      });
    }

    // Accumulate item statistics. Nothing reads these for scoring yet; they are what makes real
    // empirical calibration possible once enough attempts exist, replacing the designed
    // difficulties with measured ones.
    for (const item of items) {
      const wasCorrect = item.response?.isCorrect ?? false;
      const responseMs = item.response?.responseMs ?? 0;

      await tx.itemStatistic.upsert({
        where: { questionId: item.questionId },
        create: {
          questionId: item.questionId,
          exposures: 1,
          correctCount: wasCorrect ? 1 : 0,
          sumResponseMs: responseMs,
          sumTotalScore: score.correctCount,
          sumTotalScoreSq: score.correctCount ** 2,
          sumCorrectTotal: wasCorrect ? score.correctCount : 0,
        },
        update: {
          exposures: { increment: 1 },
          correctCount: { increment: wasCorrect ? 1 : 0 },
          sumResponseMs: { increment: responseMs },
          sumTotalScore: { increment: score.correctCount },
          sumTotalScoreSq: { increment: score.correctCount ** 2 },
          sumCorrectTotal: { increment: wasCorrect ? score.correctCount : 0 },
        },
      });
    }

    // Recompute the derived classical statistics from the running sums.
    await recomputeItemStatistics(tx, items.map((i) => i.questionId));
  });

  return getAttemptResult(attemptId, owner);
}

/**
 * Refresh p-value, point-biserial discrimination and mean response time from the running sums.
 *
 * The point-biserial correlation between item score and total score is the classical index of
 * discrimination: a near-zero or negative value means the item does not separate stronger from
 * weaker test-takers and should be reviewed or retired.
 */
async function recomputeItemStatistics(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  questionIds: readonly string[],
): Promise<void> {
  const stats = await tx.itemStatistic.findMany({
    where: { questionId: { in: [...questionIds] } },
  });

  for (const stat of stats) {
    const n = stat.exposures;
    if (n === 0) continue;

    const p = stat.correctCount / n;
    const meanResponseMs = stat.sumResponseMs / n;

    let rpb: number | null = null;
    // Needs both groups present and at least a handful of observations to mean anything.
    if (n >= 10 && stat.correctCount > 0 && stat.correctCount < n) {
      const meanTotal = stat.sumTotalScore / n;
      const varianceTotal = stat.sumTotalScoreSq / n - meanTotal ** 2;
      const sdTotal = Math.sqrt(Math.max(0, varianceTotal));

      if (sdTotal > 0) {
        const meanTotalCorrect = stat.sumCorrectTotal / stat.correctCount;
        rpb = ((meanTotalCorrect - meanTotal) / sdTotal) * Math.sqrt(p / (1 - p));
        if (!Number.isFinite(rpb)) rpb = null;
      }
    }

    await tx.itemStatistic.update({
      where: { questionId: stat.questionId },
      data: { pValue: p, meanResponseMs, rPointBiserial: rpb },
    });
  }
}

/** Fetch a completed attempt's full result, including the answer key and explanations. */
export async function getAttemptResult(
  attemptId: string,
  owner: AttemptOwner,
): Promise<AttemptResult> {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      guestKey: true,
      mode: true,
      status: true,
      startedAt: true,
      submittedAt: true,
      locale: true,
      ageYears: true,
      gender: true,
      educationLevel: true,
      theta: true,
      thetaAdjusted: true,
      sem: true,
      iqScore: true,
      iqUnadjusted: true,
      normSource: true,
      iqLower: true,
      iqUpper: true,
      percentile: true,
      confidence: true,
      reliability: true,
      correctCount: true,
      totalCount: true,
      rapidGuessing: true,
      focusLossCount: true,
      categoryScores: {
        select: {
          theta: true,
          sem: true,
          band: true,
          correctCount: true,
          totalCount: true,
          meanResponseMs: true,
          category: { select: { slug: true, name: true, sortOrder: true } },
        },
      },
      items: {
        orderBy: { position: "asc" },
        select: {
          position: true,
          questionId: true,
          choiceOrder: true,
          response: {
            select: { selectedChoiceId: true, isCorrect: true, responseMs: true, flagged: true },
          },
        },
      },
    },
  });

  if (!attempt) throw new AttemptError("not-found", "Attempt not found.", 404);

  const owned =
    (owner.userId && attempt.userId === owner.userId) ||
    (owner.guestKey && attempt.guestKey === owner.guestKey);
  if (!owned) throw new AttemptError("not-found", "Attempt not found.", 404);

  if (attempt.status !== "SUBMITTED" || attempt.submittedAt === null) {
    throw new AttemptError("not-submitted", "This attempt has not been submitted yet.", 409);
  }

  const questions = await getQuestionsWithChoices(attempt.items.map((i) => i.questionId));
  const byId = new Map(questions.map((q) => [q.id, q]));

  const scored: ScoredResponse[] = attempt.items.map((item) => {
    const question = byId.get(item.questionId);
    if (!question) throw new AttemptError("missing-question", "Question missing.", 500);
    return {
      category: question.category.slug as CategorySlug,
      parameters: { a: question.irtA, b: question.irtB, c: question.irtC },
      correct: item.response?.isCorrect ?? false,
      responseMs: item.response?.responseMs ?? 0,
    };
  });

  const locale = normaliseLocale(attempt.locale);

  // Recomputed rather than stored: narrative text is presentation, and regenerating it means an
  // improvement to the wording applies to historical attempts too. Built in the attempt's language.
  const score = scoreAttempt(scored, { ageYears: attempt.ageYears });
  const insights = buildInsights(score, scoreCategories(scored), scored, locale);

  const review: ReviewItem[] = attempt.items.map((item) => {
    const question = byId.get(item.questionId);
    if (!question) throw new AttemptError("missing-question", "Question missing.", 500);

    const byOrdinal = new Map(question.choices.map((c) => [c.ordinal, c]));
    const ordered = item.choiceOrder
      .map((ordinal) => byOrdinal.get(ordinal))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

    const correct = question.choices.find((c) => c.isCorrect);
    const selectedId = item.response?.selectedChoiceId ?? null;

    return {
      position: item.position,
      questionId: question.id,
      category: question.category.name,
      difficulty: question.difficulty,
      stem: pickLocalized(question.stem, question.stemI18n, locale) ?? question.stem,
      svg: question.svg,
      explanation: pickLocalized(question.explanation, question.explanationI18n, locale) ?? question.explanation,
      selectedChoiceId: selectedId,
      correctChoiceId: correct?.id ?? "",
      wasCorrect: item.response?.isCorrect ?? false,
      responseMs: item.response?.responseMs ?? 0,
      flagged: item.response?.flagged ?? false,
      choices: ordered.map((c) => ({
        id: c.id,
        text: pickLocalized(c.text, c.textI18n, locale),
        svg: c.svg,
        isCorrect: c.isCorrect,
        rationale: pickLocalized(c.rationale, c.rationaleI18n, locale),
        wasSelected: c.id === selectedId,
      })),
    };
  });

  const categories = [...attempt.categoryScores]
    .sort((a, b) => a.category.sortOrder - b.category.sortOrder)
    .map((c) => ({
      slug: c.category.slug,
      name: c.category.name,
      band: c.band,
      correctCount: c.correctCount,
      totalCount: c.totalCount,
      accuracy: c.totalCount === 0 ? 0 : c.correctCount / c.totalCount,
      meanResponseMs: c.meanResponseMs,
    }));

  return {
    attemptId: attempt.id,
    submittedAt: attempt.submittedAt.toISOString(),
    mode: attempt.mode,

    iq: attempt.iqScore ?? score.iq,
    iqUnadjusted: attempt.iqUnadjusted ?? score.iqUnadjusted,
    iqLower: attempt.iqLower ?? score.iqLower,
    iqUpper: attempt.iqUpper ?? score.iqUpper,
    percentile: attempt.percentile ?? score.percentile,
    confidence: attempt.confidence ?? score.confidence,
    reasoningLevel: score.reasoningLevel,
    reliability: attempt.reliability ?? score.reliability,
    theta: attempt.theta ?? score.theta,
    thetaAdjusted: attempt.thetaAdjusted ?? score.thetaAdjusted,
    sem: attempt.sem ?? score.sem,
    clamped: score.clamped,

    ageReference: {
      applied: score.ageReference.applied,
      ageYears: score.ageReference.ageYears,
      bandLabel: score.ageReference.bandLabel,
      source: score.ageReference.source,
      cautionYoungAge: score.ageReference.cautionYoungAge,
      description: describeAgeReference(score.ageReference, locale),
    },

    demographics: {
      ageYears: attempt.ageYears,
      gender: attempt.gender,
      educationLevel: attempt.educationLevel,
    },

    correctCount: attempt.correctCount ?? score.correctCount,
    totalCount: attempt.totalCount ?? score.totalCount,
    accuracy: score.accuracy,
    meanResponseMs: score.meanResponseMs,
    totalDurationMs: attempt.submittedAt.getTime() - attempt.startedAt.getTime(),

    rapidGuessing: attempt.rapidGuessing,
    focusLossCount: attempt.focusLossCount,

    categories,
    difficultyBreakdown: insights.difficultyBreakdown,
    strengths: insights.strengths,
    weaknesses: insights.weaknesses,
    recommendations: insights.recommendations,
    caveats: insights.caveats,

    review,
  };
}
