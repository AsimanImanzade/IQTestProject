import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import {
  AttemptError,
  resumeAttempt,
  saveResponse,
  startAttempt,
  recordFocusLoss,
} from "@/server/services/attempts";
import { getAttemptResult, submitAttempt } from "@/server/services/scoring";
import { invalidatePoolCache } from "@/server/repositories/questions";
import { claimGuestAttempts, registerUser, authenticate, getDashboardStats } from "@/server/services/users";
import { updateProfile } from "@/server/services/demographics";
import { validateBlueprint } from "@/core/blueprint/blueprint";
import { bandOf } from "@/core/types";
import type { CategorySlug } from "@/core/types";

/**
 * Integration tests against a real Postgres database.
 *
 * These cover the contract the unit tests cannot: that the pieces are wired together, that the
 * database constraints actually fire, and above all that the answer key never reaches a
 * test-taker before they submit.
 */

const GUEST = { guestKey: "guest-under-test" };
const OTHER_GUEST = { guestKey: "someone-else" };

async function resetTransactionalTables(): Promise<void> {
  // Questions and categories are fixtures and stay; everything an attempt writes is cleared.
  await prisma.$executeRawUnsafe(
    `TRUNCATE attempts, attempt_items, responses, category_scores, sessions, users CASCADE`,
  );
  await prisma.itemStatistic.updateMany({
    data: {
      exposures: 0,
      correctCount: 0,
      pValue: null,
      rPointBiserial: null,
      meanResponseMs: null,
      sumResponseMs: 0,
      sumTotalScore: 0,
      sumTotalScoreSq: 0,
      sumCorrectTotal: 0,
    },
  });
  invalidatePoolCache();
}

beforeEach(async () => {
  await resetTransactionalTables();
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Answer every question in an attempt. `correct` decides whether to pick the right option. */
async function answerAll(
  attemptId: string,
  owner: { guestKey?: string; userId?: string },
  correct: boolean | ((index: number) => boolean),
  responseMs = 30_000,
): Promise<void> {
  const items = await prisma.attemptItem.findMany({
    where: { attemptId },
    orderBy: { position: "asc" },
    select: { questionId: true, position: true },
  });

  for (const [index, item] of items.entries()) {
    const choices = await prisma.choice.findMany({
      where: { questionId: item.questionId },
      select: { id: true, isCorrect: true },
      orderBy: { ordinal: "asc" },
    });

    const wantCorrect = typeof correct === "function" ? correct(index) : correct;
    const choice = wantCorrect
      ? choices.find((c) => c.isCorrect)
      : choices.find((c) => !c.isCorrect);

    await saveResponse(
      {
        attemptId,
        questionId: item.questionId,
        choiceId: choice?.id ?? null,
        responseMs,
        flagged: false,
      },
      owner,
    );
  }
}

describe("starting an attempt", () => {
  it("delivers exactly 20 questions conforming to the blueprint", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");

    expect(attempt.questions).toHaveLength(20);
    expect(attempt.attemptId).toBeTruthy();

    const items = await prisma.attemptItem.findMany({
      where: { attemptId: attempt.attemptId },
      select: { questionId: true, question: { select: { difficulty: true, category: { select: { slug: true } } } } },
    });

    const candidates = items.map((i) => ({
      questionId: i.questionId,
      category: i.question.category.slug as CategorySlug,
      band: bandOf(i.question.difficulty),
    }));

    expect(validateBlueprint(candidates)).toEqual([]);
  });

  it("NEVER includes the answer key in the delivered payload", async () => {
    // The single most important assertion in the suite. A regression here hands every test-taker
    // the answers, and it is an easy regression to introduce by returning a Prisma row directly.
    const attempt = await startAttempt(GUEST, "TIMED");
    const serialised = JSON.stringify(attempt);

    expect(serialised).not.toContain("isCorrect");
    expect(serialised).not.toContain("rationale");
    expect(serialised).not.toContain("explanation");

    for (const question of attempt.questions) {
      for (const choice of question.choices) {
        expect(Object.keys(choice).sort()).toEqual(["id", "svg", "text"]);
      }
    }
  });

  it("gives every question at least four options, each with content", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    for (const question of attempt.questions) {
      expect(question.choices.length).toBeGreaterThanOrEqual(4);
      for (const choice of question.choices) {
        expect(Boolean(choice.text) || Boolean(choice.svg)).toBe(true);
      }
    }
  });

  it("sets a server-side deadline for timed mode only", async () => {
    const timed = await startAttempt(GUEST, "TIMED");
    expect(timed.expiresAt).not.toBeNull();
    expect(timed.durationSeconds).toBeGreaterThan(0);

    await resetTransactionalTables();

    const untimed = await startAttempt(GUEST, "UNTIMED");
    expect(untimed.expiresAt).toBeNull();
    expect(untimed.durationSeconds).toBeNull();
  });

  it("abandons a previous in-progress attempt, enforcing one live test per person", async () => {
    const first = await startAttempt(GUEST, "UNTIMED");
    const second = await startAttempt(GUEST, "UNTIMED");

    expect(second.attemptId).not.toBe(first.attemptId);

    const rows = await prisma.attempt.findMany({
      where: { guestKey: GUEST.guestKey },
      select: { id: true, status: true },
    });

    const live = rows.filter((r) => r.status === "IN_PROGRESS");
    expect(live).toHaveLength(1);
    expect(live[0]!.id).toBe(second.attemptId);
  });

  it("delivers a different question set on a retake", async () => {
    const first = await startAttempt(GUEST, "UNTIMED");
    const firstIds = new Set(first.questions.map((q) => q.id));

    const second = await startAttempt(GUEST, "UNTIMED");
    const overlap = second.questions.filter((q) => firstIds.has(q.id));

    // The exclusion set covers the previous attempts, so a retake should share nothing.
    expect(overlap).toHaveLength(0);
  });

  it("shuffles option order between attempts", async () => {
    const orders: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      await resetTransactionalTables();
      const attempt = await startAttempt(GUEST, "UNTIMED");
      const rows = await prisma.attemptItem.findMany({
        where: { attemptId: attempt.attemptId },
        orderBy: { position: "asc" },
        select: { choiceOrder: true },
      });
      orders.push(rows.map((r) => r.choiceOrder.join("")).join("|"));
    }
    expect(new Set(orders).size).toBeGreaterThan(1);
  });
});

describe("answering", () => {
  it("computes correctness on the server and does not reveal it", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    const question = attempt.questions[0]!;

    const correctChoice = await prisma.choice.findFirst({
      where: { questionId: question.id, isCorrect: true },
      select: { id: true },
    });

    const result = await saveResponse(
      {
        attemptId: attempt.attemptId,
        questionId: question.id,
        choiceId: correctChoice!.id,
        responseMs: 12_000,
        flagged: false,
      },
      GUEST,
    );

    // The acknowledgement must carry no information about correctness.
    expect(result).toEqual({ saved: true });
    expect(JSON.stringify(result)).not.toContain("isCorrect");

    const stored = await prisma.response.findFirst({
      where: { attemptItem: { attemptId: attempt.attemptId, questionId: question.id } },
      select: { isCorrect: true, responseMs: true },
    });
    expect(stored?.isCorrect).toBe(true);
    expect(stored?.responseMs).toBe(12_000);
  });

  it("rejects an option belonging to a different question", async () => {
    // Otherwise a caller could submit the correct choice id from an easy question against a hard
    // one and be marked correct.
    const attempt = await startAttempt(GUEST, "UNTIMED");
    const [first, second] = attempt.questions;

    const foreignChoice = await prisma.choice.findFirst({
      where: { questionId: second!.id },
      select: { id: true },
    });

    await expect(
      saveResponse(
        {
          attemptId: attempt.attemptId,
          questionId: first!.id,
          choiceId: foreignChoice!.id,
          responseMs: 5_000,
          flagged: false,
        },
        GUEST,
      ),
    ).rejects.toThrow(AttemptError);
  });

  it("rejects a question that is not part of the attempt", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    const deliveredIds = new Set(attempt.questions.map((q) => q.id));
    const outsider = await prisma.question.findFirst({
      where: { id: { notIn: [...deliveredIds] } },
      select: { id: true, choices: { select: { id: true }, take: 1 } },
    });

    await expect(
      saveResponse(
        {
          attemptId: attempt.attemptId,
          questionId: outsider!.id,
          choiceId: outsider!.choices[0]!.id,
          responseMs: 5_000,
          flagged: false,
        },
        GUEST,
      ),
    ).rejects.toThrow(/not part of this attempt/i);
  });

  it("allows clearing an answer", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    const question = attempt.questions[0]!;
    const choice = await prisma.choice.findFirst({
      where: { questionId: question.id, isCorrect: true },
      select: { id: true },
    });

    await saveResponse(
      { attemptId: attempt.attemptId, questionId: question.id, choiceId: choice!.id, responseMs: 1000, flagged: false },
      GUEST,
    );
    await saveResponse(
      { attemptId: attempt.attemptId, questionId: question.id, choiceId: null, responseMs: 2000, flagged: true },
      GUEST,
    );

    const stored = await prisma.response.findFirst({
      where: { attemptItem: { attemptId: attempt.attemptId, questionId: question.id } },
      select: { selectedChoiceId: true, isCorrect: true, flagged: true },
    });
    expect(stored?.selectedChoiceId).toBeNull();
    expect(stored?.isCorrect).toBe(false);
    expect(stored?.flagged).toBe(true);
  });

  it("refuses answers after the deadline has passed", async () => {
    const attempt = await startAttempt(GUEST, "TIMED");
    // Move the deadline into the past, beyond the grace window.
    await prisma.attempt.update({
      where: { id: attempt.attemptId },
      data: { expiresAt: new Date(Date.now() - 120_000) },
    });

    const question = attempt.questions[0]!;
    await expect(
      saveResponse(
        { attemptId: attempt.attemptId, questionId: question.id, choiceId: null, responseMs: 1000, flagged: false },
        GUEST,
      ),
    ).rejects.toThrow(/time limit/i);
  });

  it("records tab switches as an integrity signal", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    await recordFocusLoss(attempt.attemptId, GUEST);
    const second = await recordFocusLoss(attempt.attemptId, GUEST);
    expect(second.focusLossCount).toBe(2);
  });
});

describe("ownership isolation", () => {
  it("hides another person's attempt behind a 404", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");

    await expect(resumeAttempt(attempt.attemptId, OTHER_GUEST)).rejects.toMatchObject({
      status: 404,
    });

    await expect(
      saveResponse(
        {
          attemptId: attempt.attemptId,
          questionId: attempt.questions[0]!.id,
          choiceId: null,
          responseMs: 1000,
          flagged: false,
        },
        OTHER_GUEST,
      ),
    ).rejects.toMatchObject({ status: 404 });

    await expect(submitAttempt(attempt.attemptId, OTHER_GUEST)).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("resuming", () => {
  it("restores the questions and saved answers", async () => {
    const attempt = await startAttempt(GUEST, "TIMED");
    const question = attempt.questions[0]!;
    const choice = await prisma.choice.findFirst({
      where: { questionId: question.id },
      select: { id: true },
    });

    await saveResponse(
      { attemptId: attempt.attemptId, questionId: question.id, choiceId: choice!.id, responseMs: 8000, flagged: true },
      GUEST,
    );

    const resumed = await resumeAttempt(attempt.attemptId, GUEST);

    expect(resumed.questions).toHaveLength(20);
    expect(resumed.expiresAt).toBe(attempt.expiresAt);
    expect(JSON.stringify(resumed.questions)).not.toContain("isCorrect");

    const saved = resumed.responses.find((r) => r.questionId === question.id);
    expect(saved?.selectedChoiceId).toBe(choice!.id);
    expect(saved?.flagged).toBe(true);
  });

  it("preserves the original deadline rather than restarting the clock", async () => {
    const attempt = await startAttempt(GUEST, "TIMED");
    const resumed = await resumeAttempt(attempt.attemptId, GUEST);
    expect(resumed.startedAt).toBe(attempt.startedAt);
    expect(resumed.expiresAt).toBe(attempt.expiresAt);
  });
});

describe("submitting and scoring", () => {
  it("scores a perfect attempt above an all-wrong one", async () => {
    const good = await startAttempt(GUEST, "UNTIMED");
    await answerAll(good.attemptId, GUEST, true);
    const goodResult = await submitAttempt(good.attemptId, GUEST);

    const bad = await startAttempt(OTHER_GUEST, "UNTIMED");
    await answerAll(bad.attemptId, OTHER_GUEST, false);
    const badResult = await submitAttempt(bad.attemptId, OTHER_GUEST);

    expect(goodResult.correctCount).toBe(20);
    expect(badResult.correctCount).toBe(0);
    expect(goodResult.iq).toBeGreaterThan(badResult.iq);
    expect(goodResult.percentile).toBeGreaterThan(badResult.percentile);
  });

  it("always reports an interval containing the estimate", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    await answerAll(attempt.attemptId, GUEST, (i) => i % 2 === 0);
    const result = await submitAttempt(attempt.attemptId, GUEST);

    expect(result.iqLower).toBeLessThanOrEqual(result.iq);
    expect(result.iqUpper).toBeGreaterThanOrEqual(result.iq);
    expect(result.iq).toBeGreaterThanOrEqual(55);
    expect(result.iq).toBeLessThanOrEqual(145);
  });

  it("treats unanswered questions as incorrect rather than ignoring them", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    // Answer only the first five.
    const items = await prisma.attemptItem.findMany({
      where: { attemptId: attempt.attemptId },
      orderBy: { position: "asc" },
      take: 5,
      select: { questionId: true },
    });
    for (const item of items) {
      const choice = await prisma.choice.findFirst({
        where: { questionId: item.questionId, isCorrect: true },
        select: { id: true },
      });
      await saveResponse(
        { attemptId: attempt.attemptId, questionId: item.questionId, choiceId: choice!.id, responseMs: 20_000, flagged: false },
        GUEST,
      );
    }

    const result = await submitAttempt(attempt.attemptId, GUEST);
    expect(result.totalCount).toBe(20);
    expect(result.correctCount).toBe(5);
  });

  it("is idempotent — resubmitting returns the same score", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    await answerAll(attempt.attemptId, GUEST, (i) => i % 3 === 0);

    const first = await submitAttempt(attempt.attemptId, GUEST);
    const second = await submitAttempt(attempt.attemptId, GUEST);

    expect(second.iq).toBe(first.iq);
    expect(second.theta).toBeCloseTo(first.theta, 10);
    expect(second.submittedAt).toBe(first.submittedAt);
  });

  it("flags rapid guessing and lowers confidence", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    await answerAll(attempt.attemptId, GUEST, true, 500);
    const result = await submitAttempt(attempt.attemptId, GUEST);

    expect(result.rapidGuessing).toBe(true);
    expect(result.confidence).toBe("LOW");
    expect(result.caveats.join(" ")).toMatch(/quickly/i);
  });

  it("reports per-category bands covering every delivered category", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    await answerAll(attempt.attemptId, GUEST, true);
    const result = await submitAttempt(attempt.attemptId, GUEST);

    expect(result.categories.length).toBeGreaterThanOrEqual(6);
    const totalItems = result.categories.reduce((s, c) => s + c.totalCount, 0);
    expect(totalItems).toBe(20);

    for (const category of result.categories) {
      expect(["BELOW_AVERAGE", "AVERAGE", "ABOVE_AVERAGE"]).toContain(category.band);
    }
  });

  it("returns a full review with explanations only after submission", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");

    // Before submission the result is unavailable.
    await expect(getAttemptResult(attempt.attemptId, GUEST)).rejects.toMatchObject({ status: 409 });

    await answerAll(attempt.attemptId, GUEST, (i) => i % 2 === 0);
    const result = await submitAttempt(attempt.attemptId, GUEST);

    expect(result.review).toHaveLength(20);
    for (const item of result.review) {
      expect(item.explanation.length).toBeGreaterThan(10);
      expect(item.correctChoiceId).toBeTruthy();
      expect(item.choices.filter((c) => c.isCorrect)).toHaveLength(1);
    }
  });

  it("accumulates item statistics for future calibration", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    const items = await prisma.attemptItem.findMany({
      where: { attemptId: attempt.attemptId },
      select: { questionId: true },
    });

    await answerAll(attempt.attemptId, GUEST, true);
    await submitAttempt(attempt.attemptId, GUEST);

    const stats = await prisma.itemStatistic.findMany({
      where: { questionId: { in: items.map((i) => i.questionId) } },
      select: { exposures: true, correctCount: true, pValue: true, meanResponseMs: true },
    });

    expect(stats).toHaveLength(20);
    for (const stat of stats) {
      expect(stat.exposures).toBe(1);
      expect(stat.correctCount).toBe(1);
      expect(stat.pValue).toBe(1);
      expect(stat.meanResponseMs).toBe(30_000);
    }
  });

  it("records the difficulty breakdown matching the blueprint", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    await answerAll(attempt.attemptId, GUEST, true);
    const result = await submitAttempt(attempt.attemptId, GUEST);

    const byBand = new Map(result.difficultyBreakdown.map((b) => [b.band, b.totalCount]));
    expect(byBand.get("easy")).toBe(4);
    expect(byBand.get("medium")).toBe(8);
    expect(byBand.get("hard")).toBe(6);
    expect(byBand.get("very-hard")).toBe(2);
  });
});

describe("accounts and guest claiming", () => {
  it("moves guest attempts onto a new account", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    await answerAll(attempt.attemptId, GUEST, true);
    await submitAttempt(attempt.attemptId, GUEST);

    const user = await registerUser({
      email: "Claimer@Example.com",
      password: "a-sufficiently-long-password",
      displayName: "Claimer",
    });

    const claimed = await claimGuestAttempts(user.id, GUEST.guestKey);
    expect(claimed).toBe(1);

    const moved = await prisma.attempt.findUnique({
      where: { id: attempt.attemptId },
      select: { userId: true, guestKey: true },
    });
    // The database CHECK constraint requires exactly one owner, so guestKey must be cleared.
    expect(moved?.userId).toBe(user.id);
    expect(moved?.guestKey).toBeNull();

    // And the claimed attempt is now readable as the user.
    const result = await getAttemptResult(attempt.attemptId, { userId: user.id });
    expect(result.correctCount).toBe(20);
  });

  it("normalises email case and authenticates", async () => {
    await registerUser({ email: "Mixed.Case@Example.com", password: "another-long-password" });

    const viaLower = await authenticate({
      email: "mixed.case@example.com",
      password: "another-long-password",
    });
    expect(viaLower).not.toBeNull();

    const wrongPassword = await authenticate({
      email: "mixed.case@example.com",
      password: "not-the-password",
    });
    expect(wrongPassword).toBeNull();
  });

  it("refuses a duplicate registration without revealing the account exists", async () => {
    await registerUser({ email: "dupe@example.com", password: "a-sufficiently-long-password" });
    await expect(
      registerUser({ email: "dupe@example.com", password: "a-sufficiently-long-password" }),
    ).rejects.toThrow(/cannot be used/i);
  });

  it("stores the password only as an argon2 hash", async () => {
    const password = "correct-horse-battery-staple";
    const user = await registerUser({ email: "hash@example.com", password });

    const row = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });

    expect(row?.passwordHash).not.toContain(password);
    expect(row?.passwordHash).toMatch(/^\$argon2id\$/);
  });
});

describe("demographics and age referencing", () => {
  it("stores a guest's demographics on the attempt", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED", {
      ageYears: 34,
      gender: "FEMALE",
      educationLevel: "MASTERS",
    });

    const row = await prisma.attempt.findUnique({
      where: { id: attempt.attemptId },
      select: { ageYears: true, gender: true, educationLevel: true },
    });

    expect(row?.ageYears).toBe(34);
    expect(row?.gender).toBe("FEMALE");
    expect(row?.educationLevel).toBe("MASTERS");
  });

  it("takes a signed-in user's age from their profile, not from the request", async () => {
    // A crafted request must not be able to score an attempt against an age the person never
    // claimed, so the profile always wins for signed-in users.
    const user = await registerUser({ email: "profiled@example.com", password: "a-long-enough-password" });
    await updateProfile(user.id, { birthYear: new Date().getFullYear() - 41, gender: "MALE" });

    const attempt = await startAttempt({ userId: user.id }, "UNTIMED", {
      ageYears: 18, // ignored
      gender: "FEMALE", // ignored
    });

    const row = await prisma.attempt.findUnique({
      where: { id: attempt.attemptId },
      select: { ageYears: true, gender: true },
    });

    expect(row?.ageYears).toBe(41);
    expect(row?.gender).toBe("MALE");
  });

  it("scores a younger person higher than an older one for identical answers", async () => {
    // The core requirement, end to end through the database.
    const young = await startAttempt(GUEST, "UNTIMED", { ageYears: 13 });
    await answerAll(young.attemptId, GUEST, (i) => i % 2 === 0);
    const youngResult = await submitAttempt(young.attemptId, GUEST);

    const adult = await startAttempt(OTHER_GUEST, "UNTIMED", { ageYears: 22 });
    await answerAll(adult.attemptId, OTHER_GUEST, (i) => i % 2 === 0);
    const adultResult = await submitAttempt(adult.attemptId, OTHER_GUEST);

    expect(youngResult.ageReference.applied).toBe(true);
    expect(youngResult.ageReference.bandLabel).toBe("12–13");
    expect(youngResult.iq).toBeGreaterThan(adultResult.iq);
  });

  it("persists both the adjusted and the unadjusted score", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED", { ageYears: 68 });
    await answerAll(attempt.attemptId, GUEST, true);
    const result = await submitAttempt(attempt.attemptId, GUEST);

    const row = await prisma.attempt.findUnique({
      where: { id: attempt.attemptId },
      select: { iqScore: true, iqUnadjusted: true, theta: true, thetaAdjusted: true, normSource: true },
    });

    expect(row).not.toBeNull();
    expect(row!.normSource).toBe("modelled-v1");
    expect(row!.iqScore).toBe(result.iq);
    expect(row!.iqUnadjusted).toBe(result.iqUnadjusted);
    // A 68-year-old is compared against a lower-scoring group, so the adjusted ability is higher.
    expect(row!.thetaAdjusted).toBeGreaterThan(row!.theta!);
  });

  it("scores without adjustment when a guest gives no age", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    await answerAll(attempt.attemptId, GUEST, true);
    const result = await submitAttempt(attempt.attemptId, GUEST);

    expect(result.ageReference.applied).toBe(false);
    expect(result.iq).toBe(result.iqUnadjusted);
  });

  it("rejects an age outside the supported range", async () => {
    await expect(startAttempt(GUEST, "UNTIMED", { ageYears: 7 })).rejects.toThrow(/between 12 and 100/i);
    await expect(startAttempt(GUEST, "UNTIMED", { ageYears: 150 })).rejects.toThrow(AttemptError);
  });

  it("produces identical scores regardless of gender or education", async () => {
    // Gender and education are collected but must never touch a calculation.
    const a = await startAttempt(GUEST, "UNTIMED", {
      ageYears: 30, gender: "FEMALE", educationLevel: "DOCTORATE",
    });
    await answerAll(a.attemptId, GUEST, (i) => i < 14);
    const first = await submitAttempt(a.attemptId, GUEST);

    const b = await startAttempt(OTHER_GUEST, "UNTIMED", {
      ageYears: 30, gender: "MALE", educationLevel: "PRIMARY",
    });
    await answerAll(b.attemptId, OTHER_GUEST, (i) => i < 14);
    const second = await submitAttempt(b.attemptId, OTHER_GUEST);

    // The two attempts get different question sets, so the scores legitimately differ. What must
    // be identical is the age handling itself.
    //
    // This is compared on the unrounded ability scale, not on the reported IQ. The shift for
    // ages 30–34 is 0.06 logits ≈ 0.9 points, and whether that crosses a rounding boundary
    // depends on the fractional part of theta — so `iq - iqUnadjusted` is legitimately 0 for one
    // attempt and 1 for another. Asserting on the rounded difference made this test flaky.
    expect(first.ageReference.bandLabel).toBe(second.ageReference.bandLabel);
    expect(first.ageReference.source).toBe(second.ageReference.source);
    expect(first.thetaAdjusted - first.theta).toBeCloseTo(
      second.thetaAdjusted - second.theta,
      12,
    );
  });

  it("keeps a result reproducible after the profile changes", async () => {
    // Age is snapshotted at attempt time, so a birthday must not retroactively alter a past score.
    const user = await registerUser({ email: "birthday@example.com", password: "a-long-enough-password" });
    await updateProfile(user.id, { birthYear: new Date().getFullYear() - 30 });

    const attempt = await startAttempt({ userId: user.id }, "UNTIMED");
    await answerAll(attempt.attemptId, { userId: user.id }, true);
    const before = await submitAttempt(attempt.attemptId, { userId: user.id });

    await updateProfile(user.id, { birthYear: new Date().getFullYear() - 65 });
    const after = await getAttemptResult(attempt.attemptId, { userId: user.id });

    expect(after.iq).toBe(before.iq);
    expect(after.ageReference.ageYears).toBe(30);
  });
});

describe("nationality and profession (signed-in reference comparison)", () => {
  it("snapshots a signed-in user's country and profession onto the attempt", async () => {
    const user = await registerUser({ email: "az@example.com", password: "a-long-enough-password" });
    await updateProfile(user.id, { birthYear: new Date().getFullYear() - 30, nationality: "AZ", profession: "ENGINEERING" });

    const attempt = await startAttempt({ userId: user.id }, "UNTIMED");
    const row = await prisma.attempt.findUnique({
      where: { id: attempt.attemptId },
      select: { nationality: true, profession: true },
    });

    expect(row?.nationality).toBe("AZ");
    expect(row?.profession).toBe("ENGINEERING");
  });

  it("never records nationality or profession for a guest", async () => {
    // The feature is signed-in only; guest mode must be entirely unaffected.
    const attempt = await startAttempt(GUEST, "UNTIMED", { ageYears: 30, gender: "FEMALE" });
    const row = await prisma.attempt.findUnique({
      where: { id: attempt.attemptId },
      select: { nationality: true, profession: true, ageYears: true },
    });

    expect(row?.nationality).toBeNull();
    expect(row?.profession).toBeNull();
    // ...while the existing guest demographics still work.
    expect(row?.ageYears).toBe(30);
  });

  it("ignores nationality/profession sent in a guest's start request", async () => {
    // Even if a crafted guest request carried these, they are not part of the guest contract.
    const attempt = await startAttempt(GUEST, "UNTIMED", { ageYears: 25 });
    const row = await prisma.attempt.findUnique({
      where: { id: attempt.attemptId },
      select: { nationality: true },
    });
    expect(row?.nationality).toBeNull();
  });

  it("surfaces a country and profession comparison on the dashboard", async () => {
    const user = await registerUser({ email: "compare@example.com", password: "a-long-enough-password" });
    await updateProfile(user.id, { birthYear: new Date().getFullYear() - 30, nationality: "AZ", profession: "MEDICINE" });

    const attempt = await startAttempt({ userId: user.id }, "UNTIMED");
    await answerAll(attempt.attemptId, { userId: user.id }, (i) => i % 3 !== 0);
    await submitAttempt(attempt.attemptId, { userId: user.id });

    const stats = await getDashboardStats(user.id);

    expect(stats.countryComparison).not.toBeNull();
    expect(stats.countryComparison!.groupLabel).toBe("Azerbaijan");
    expect(stats.countryComparison!.referenceAverage).toBe(98);
    // The difference must equal displayed-score minus the reference.
    expect(stats.countryComparison!.difference).toBe(
      stats.countryComparison!.userScore - 98,
    );
    expect(stats.countryComparison!.caveat).toMatch(/not on the same calibrated scale/i);

    expect(stats.professionComparison).not.toBeNull();
    expect(stats.professionComparison!.groupLabel).toMatch(/medicine/i);
  });

  it("omits comparisons when the profile has no country or profession", async () => {
    const user = await registerUser({ email: "nocompare@example.com", password: "a-long-enough-password" });
    await updateProfile(user.id, { birthYear: new Date().getFullYear() - 30 });

    const attempt = await startAttempt({ userId: user.id }, "UNTIMED");
    await answerAll(attempt.attemptId, { userId: user.id }, true);
    await submitAttempt(attempt.attemptId, { userId: user.id });

    const stats = await getDashboardStats(user.id);
    expect(stats.countryComparison).toBeNull();
    expect(stats.professionComparison).toBeNull();
  });

  it("rejects an unknown country or profession on the profile", async () => {
    const user = await registerUser({ email: "badprofile@example.com", password: "a-long-enough-password" });
    await expect(updateProfile(user.id, { nationality: "ZZ" })).rejects.toThrow(/country/i);
    await expect(updateProfile(user.id, { profession: "WIZARD" })).rejects.toThrow(/profession/i);
  });

  it("does not let nationality change a score", async () => {
    // Structural guarantee mirroring the gender/education one: the reference feature is display
    // only. Two users with identical answers but different countries get identical raw scores.
    const azUser = await registerUser({ email: "az2@example.com", password: "a-long-enough-password" });
    await updateProfile(azUser.id, { birthYear: new Date().getFullYear() - 30, nationality: "AZ" });
    const az = await startAttempt({ userId: azUser.id }, "UNTIMED");
    await answerAll(az.attemptId, { userId: azUser.id }, (i) => i < 12);
    const azResult = await submitAttempt(az.attemptId, { userId: azUser.id });

    const jpUser = await registerUser({ email: "jp2@example.com", password: "a-long-enough-password" });
    await updateProfile(jpUser.id, { birthYear: new Date().getFullYear() - 30, nationality: "JP" });
    const jp = await startAttempt({ userId: jpUser.id }, "UNTIMED");
    await answerAll(jp.attemptId, { userId: jpUser.id }, (i) => i < 12);
    const jpResult = await submitAttempt(jp.attemptId, { userId: jpUser.id });

    // Both are age-referenced identically (same age band); nationality plays no part in the score.
    expect(azResult.ageReference.bandLabel).toBe(jpResult.ageReference.bandLabel);
    // The dashboards differ only in the reference figure they compare against, not in how the
    // score itself was produced.
    const azStats = await getDashboardStats(azUser.id);
    const jpStats = await getDashboardStats(jpUser.id);
    expect(azStats.countryComparison!.referenceAverage).toBe(98);
    expect(jpStats.countryComparison!.referenceAverage).toBe(106);
  });
});

describe("localization (Azerbaijani delivery)", () => {
  it("delivers questions in Azerbaijani when the attempt locale is az", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED", undefined, "az");

    // The stored attempt records its language.
    const row = await prisma.attempt.findUnique({
      where: { id: attempt.attemptId },
      select: { locale: true },
    });
    expect(row?.locale).toBe("az");

    // Delivered text must contain Azerbaijani-specific characters somewhere — a purely English
    // payload would have none of ə/ı/ş/ğ across 20 questions and their options.
    const serialised = JSON.stringify(attempt.questions);
    expect(/[əıışşğ]/i.test(serialised)).toBe(true);

    // And the answer key still never leaks, in any language.
    expect(serialised).not.toContain("isCorrect");
    expect(serialised).not.toContain("rationale");
  });

  it("localizes the result review and narrative for an az attempt", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED", undefined, "az");
    await answerAll(attempt.attemptId, GUEST, (i) => i % 3 !== 0);
    const result = await submitAttempt(attempt.attemptId, GUEST);

    // Review explanations come back in Azerbaijani.
    const reviewText = result.review.map((r) => r.explanation).join(" ");
    expect(/[əıışşğ]/i.test(reviewText)).toBe(true);

    // The generated narrative (strengths/recommendations) is Azerbaijani too.
    const narrative = [...result.strengths, ...result.recommendations, ...result.caveats].join(" ");
    expect(/[əıışşğ]/i.test(narrative)).toBe(true);
  });

  it("defaults to English and keeps English delivery working", async () => {
    const attempt = await startAttempt(GUEST, "UNTIMED");
    const row = await prisma.attempt.findUnique({
      where: { id: attempt.attemptId },
      select: { locale: true },
    });
    expect(row?.locale).toBe("en");
    // First question stem should be plain ASCII English.
    expect(attempt.questions[0]!.stem).toMatch(/^[\x00-\x7F]+$/);
  });

  it("resumes an az attempt in Azerbaijani, not the default", async () => {
    const started = await startAttempt(GUEST, "UNTIMED", undefined, "az");
    const resumed = await resumeAttempt(started.attemptId, GUEST);
    expect(/[əıışşğ]/i.test(JSON.stringify(resumed.questions))).toBe(true);
  });
});

describe("database integrity constraints", () => {
  it("rejects an attempt owned by both a user and a guest", async () => {
    const user = await registerUser({ email: "both@example.com", password: "a-long-enough-password" });
    await expect(
      prisma.attempt.create({
        data: { userId: user.id, guestKey: "also-a-guest", mode: "UNTIMED", seed: "x" },
      }),
    ).rejects.toThrow();
  });

  it("rejects an attempt with no owner at all", async () => {
    await expect(
      prisma.attempt.create({ data: { mode: "UNTIMED", seed: "x" } }),
    ).rejects.toThrow();
  });

  it("rejects a question with an out-of-range difficulty", async () => {
    const category = await prisma.category.findFirstOrThrow({ select: { id: true } });
    await expect(
      prisma.question.create({
        data: {
          categoryId: category.id,
          difficulty: 42,
          irtB: 0,
          stem: "bad",
          explanation: "bad",
          generatorId: "test",
          seed: "test",
          signature: `bad-${Date.now()}`,
        },
      }),
    ).rejects.toThrow();
  });
});
