import { randomBytes } from "node:crypto";
import { prisma } from "../db";
import {
  getQuestionPool,
  getQuestionsWithChoices,
  pickLocalized,
  toClientChoice,
} from "../repositories/questions";
import type { Locale } from "@/core/i18n";
import type { ClientQuestion } from "../repositories/questions";
import { assembleTest, shuffleDelivery } from "@/core/blueprint/sampler";
import { TEST_LENGTH } from "@/core/blueprint/blueprint";
import { createRng } from "@/core/generation/rng";
import { resolveForAttempt, type DemographicsInput } from "./demographics";
import type { TestMode } from "@/generated/prisma/enums";

/**
 * Attempt lifecycle: start, answer, submit.
 *
 * Two rules govern everything here.
 *
 * 1. THE ANSWER KEY NEVER LEAVES THE SERVER BEFORE SUBMISSION. Grading happens here, not in the
 *    browser; the payload sent to the client is projected through `toClientChoice`; and saving an
 *    answer deliberately does NOT tell the client whether it was right, because that would let
 *    anyone brute-force each question by watching the response.
 *
 * 2. THE CLOCK IS SERVER-AUTHORITATIVE. The countdown in the browser is presentation only. The
 *    deadline is computed from `startedAt` stored at creation, and late answers are rejected
 *    server-side. Otherwise stopping the JavaScript timer would grant unlimited time.
 */

/** Allowance for network latency and clock skew when enforcing the deadline. */
const SUBMISSION_GRACE_MS = 30_000;

export const TIMED_MODE_MINUTES = Number(process.env.TIMED_MODE_MINUTES ?? 25);

/** How many past attempts to look back over when avoiding repeat questions. */
const EXCLUSION_LOOKBACK_ATTEMPTS = 5;

export interface AttemptOwner {
  userId?: string;
  guestKey?: string;
}

export class AttemptError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "AttemptError";
    this.code = code;
    this.status = status;
  }
}

function ownerWhere(owner: AttemptOwner) {
  if (owner.userId) return { userId: owner.userId };
  if (owner.guestKey) return { guestKey: owner.guestKey };
  throw new AttemptError("no-owner", "An attempt must belong to a user or a guest.", 400);
}

export interface StartedAttempt {
  attemptId: string;
  mode: TestMode;
  startedAt: string;
  expiresAt: string | null;
  durationSeconds: number | null;
  totalQuestions: number;
  questions: ClientQuestion[];
}

/**
 * Start a new attempt.
 *
 * Any attempt already in progress for this owner is abandoned first. The database enforces one
 * live attempt per owner with a partial unique index, so this is not merely tidiness — without it
 * the insert below would fail.
 */
export async function startAttempt(
  owner: AttemptOwner,
  mode: TestMode,
  demographics?: DemographicsInput,
  locale: Locale = "en",
): Promise<StartedAttempt> {
  const where = ownerWhere(owner);

  // Snapshotted onto the attempt rather than joined at read time: people age, edit their profile
  // and delete their account, but a completed assessment must remain reproducible exactly as it
  // was scored.
  const resolved = await resolveForAttempt(owner, demographics);

  await prisma.attempt.updateMany({
    where: { ...where, status: "IN_PROGRESS" },
    data: { status: "ABANDONED" },
  });

  // The pool is filtered to the chosen language, so a test assembled in Azerbaijani only draws
  // from items fully available in Azerbaijani.
  const pool = await getQuestionPool(locale);
  if (pool.length < TEST_LENGTH) {
    throw new AttemptError(
      "bank-too-small",
      `The question bank holds ${pool.length} questions in "${locale}"; ${TEST_LENGTH} are needed. Run \`npm run db:seed\`.`,
      503,
    );
  }

  // Avoid questions this person has recently seen, so a retake feels genuinely new.
  const recent = await prisma.attempt.findMany({
    where: { ...where },
    orderBy: { startedAt: "desc" },
    take: EXCLUSION_LOOKBACK_ATTEMPTS,
    select: { items: { select: { questionId: true } } },
  });
  const exclude = new Set(recent.flatMap((a) => a.items.map((i) => i.questionId)));

  // The seed is stored on the attempt, so the exact test delivered can be reconstructed later
  // for audit or dispute.
  const seed = randomBytes(12).toString("base64url");
  const rng = createRng(seed);

  const selected = assembleTest(pool, rng, { exclude });
  const choiceCounts = new Map(pool.map((p) => [p.questionId, p.choiceCount]));
  const delivery = shuffleDelivery(selected, choiceCounts, rng);

  const durationSeconds = mode === "TIMED" ? TIMED_MODE_MINUTES * 60 : null;
  const startedAt = new Date();
  const expiresAt = durationSeconds ? new Date(startedAt.getTime() + durationSeconds * 1000) : null;

  const attempt = await prisma.attempt.create({
    data: {
      ...where,
      mode,
      status: "IN_PROGRESS",
      seed,
      locale,
      durationSeconds,
      startedAt,
      expiresAt,
      ageYears: resolved.ageYears,
      gender: resolved.gender,
      educationLevel: resolved.educationLevel,
      nationality: resolved.nationality,
      profession: resolved.profession,
      items: {
        create: delivery.map((d) => ({
          questionId: d.questionId,
          position: d.position,
          choiceOrder: d.choiceOrder,
        })),
      },
    },
    select: { id: true },
  });

  const questions = await buildClientQuestions(attempt.id, locale);

  return {
    attemptId: attempt.id,
    mode,
    startedAt: startedAt.toISOString(),
    expiresAt: expiresAt?.toISOString() ?? null,
    durationSeconds,
    totalQuestions: questions.length,
    questions,
  };
}

/**
 * Build the client-facing question list for an attempt, applying each question's stored option
 * permutation. Options are returned in the shuffled order, and the client only ever refers to a
 * choice by its id.
 */
async function buildClientQuestions(attemptId: string, locale: string): Promise<ClientQuestion[]> {
  const items = await prisma.attemptItem.findMany({
    where: { attemptId },
    orderBy: { position: "asc" },
    select: { questionId: true, position: true, choiceOrder: true },
  });

  const questions = await getQuestionsWithChoices(items.map((i) => i.questionId));
  const byId = new Map(questions.map((q) => [q.id, q]));

  return items.map((item) => {
    const question = byId.get(item.questionId);
    if (!question) {
      throw new AttemptError("missing-question", "A delivered question no longer exists.", 500);
    }

    const byOrdinal = new Map(question.choices.map((c) => [c.ordinal, c]));
    const ordered = item.choiceOrder
      .map((ordinal) => byOrdinal.get(ordinal))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

    return {
      id: question.id,
      position: item.position,
      category: { slug: question.category.slug, name: question.category.name },
      // Delivered in the attempt's language, falling back to English where a translation is absent.
      stem: pickLocalized(question.stem, question.stemI18n, locale) ?? question.stem,
      svg: question.svg,
      estimatedSeconds: question.estimatedSeconds,
      // Projection: isCorrect and rationale are dropped here and nowhere else.
      choices: ordered.map((c) => toClientChoice(c, locale)),
    };
  });
}

/** Load an in-progress attempt for resumption (page refresh, browser crash, second device). */
export async function resumeAttempt(
  attemptId: string,
  owner: AttemptOwner,
): Promise<StartedAttempt & { responses: SavedResponse[] }> {
  const attempt = await loadOwnedAttempt(attemptId, owner);

  if (attempt.status !== "IN_PROGRESS") {
    throw new AttemptError("not-in-progress", "This attempt has already been submitted.", 409);
  }

  // Resume in the language the attempt was started in, not the current cookie.
  const questions = await buildClientQuestions(attemptId, attempt.locale);
  const responses = await getSavedResponses(attemptId);

  return {
    attemptId: attempt.id,
    mode: attempt.mode,
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: attempt.expiresAt?.toISOString() ?? null,
    durationSeconds: attempt.durationSeconds,
    totalQuestions: questions.length,
    questions,
    responses,
  };
}

export interface SavedResponse {
  questionId: string;
  selectedChoiceId: string | null;
  flagged: boolean;
  responseMs: number;
}

export async function getSavedResponses(attemptId: string): Promise<SavedResponse[]> {
  const rows = await prisma.response.findMany({
    where: { attemptItem: { attemptId } },
    select: {
      selectedChoiceId: true,
      flagged: true,
      responseMs: true,
      attemptItem: { select: { questionId: true } },
    },
  });

  return rows.map((row) => ({
    questionId: row.attemptItem.questionId,
    selectedChoiceId: row.selectedChoiceId,
    flagged: row.flagged,
    responseMs: row.responseMs,
  }));
}

async function loadOwnedAttempt(attemptId: string, owner: AttemptOwner) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      userId: true,
      guestKey: true,
      mode: true,
      status: true,
      startedAt: true,
      expiresAt: true,
      durationSeconds: true,
      focusLossCount: true,
      locale: true,
    },
  });

  if (!attempt) throw new AttemptError("not-found", "Attempt not found.", 404);

  const ownedByUser = owner.userId && attempt.userId === owner.userId;
  const ownedByGuest = owner.guestKey && attempt.guestKey === owner.guestKey;
  if (!ownedByUser && !ownedByGuest) {
    // 404 rather than 403: confirming an attempt exists would leak that someone else's id is real.
    throw new AttemptError("not-found", "Attempt not found.", 404);
  }

  return attempt;
}

export interface SaveResponseInput {
  attemptId: string;
  questionId: string;
  /** Null clears the answer. */
  choiceId: string | null;
  responseMs: number;
  flagged: boolean;
}

/**
 * Record an answer.
 *
 * Correctness is computed and stored here but deliberately NOT returned: telling the client
 * whether each answer was right would turn the test into an oracle that could be queried option
 * by option.
 */
export async function saveResponse(
  input: SaveResponseInput,
  owner: AttemptOwner,
): Promise<{ saved: true }> {
  const attempt = await loadOwnedAttempt(input.attemptId, owner);

  if (attempt.status !== "IN_PROGRESS") {
    throw new AttemptError("not-in-progress", "This attempt is no longer accepting answers.", 409);
  }

  if (attempt.expiresAt && Date.now() > attempt.expiresAt.getTime() + SUBMISSION_GRACE_MS) {
    throw new AttemptError("expired", "The time limit for this attempt has passed.", 409);
  }

  const item = await prisma.attemptItem.findUnique({
    where: { attemptId_questionId: { attemptId: input.attemptId, questionId: input.questionId } },
    select: { id: true, questionId: true },
  });
  if (!item) {
    throw new AttemptError("not-in-attempt", "That question is not part of this attempt.", 400);
  }

  let isCorrect = false;
  if (input.choiceId) {
    const choice = await prisma.choice.findUnique({
      where: { id: input.choiceId },
      select: { questionId: true, isCorrect: true },
    });
    // The choice must belong to the question being answered, or a caller could submit the
    // correct choice id from a different (easier) question.
    if (!choice || choice.questionId !== item.questionId) {
      throw new AttemptError("bad-choice", "That option does not belong to this question.", 400);
    }
    isCorrect = choice.isCorrect;
  }

  // Guard against a stopped clock or a replayed request inflating the recorded time.
  const responseMs = Math.min(Math.max(0, Math.round(input.responseMs)), 60 * 60 * 1000);

  await prisma.response.upsert({
    where: { attemptItemId: item.id },
    create: {
      attemptItemId: item.id,
      selectedChoiceId: input.choiceId,
      isCorrect,
      responseMs,
      flagged: input.flagged,
    },
    update: {
      selectedChoiceId: input.choiceId,
      isCorrect,
      responseMs,
      flagged: input.flagged,
    },
  });

  return { saved: true };
}

/** Record that the test-taker switched away from the tab. */
export async function recordFocusLoss(
  attemptId: string,
  owner: AttemptOwner,
): Promise<{ focusLossCount: number }> {
  await loadOwnedAttempt(attemptId, owner);
  const updated = await prisma.attempt.update({
    where: { id: attemptId },
    data: { focusLossCount: { increment: 1 } },
    select: { focusLossCount: true },
  });
  return updated;
}

export { SUBMISSION_GRACE_MS };
