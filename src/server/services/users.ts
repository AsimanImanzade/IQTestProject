import { prisma } from "../db";
import { DUMMY_HASH, hashPassword, verifyPassword } from "../auth/password";
import { AttemptError } from "./attempts";
import { compareToCountry, compareToProfession } from "@/core/reference/comparison";
import type { ScoreComparison } from "@/core/reference/comparison";

/**
 * Registration, login and guest-attempt claiming.
 */

export interface PublicUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function registerUser(input: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<PublicUser> {
  const email = normaliseEmail(input.email);

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    // Deliberately the same wording the login route uses, so registration cannot be used to
    // enumerate which email addresses already have accounts.
    throw new AttemptError("email-taken", "That email address cannot be used.", 409);
  }

  const passwordHash = await hashPassword(input.password);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName: input.displayName?.trim() || null,
    },
    select: { id: true, email: true, displayName: true, role: true },
  });

  return user;
}

export async function authenticate(input: {
  email: string;
  password: string;
}): Promise<PublicUser | null> {
  const email = normaliseEmail(input.email);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, displayName: true, role: true, passwordHash: true },
  });

  // Always run a verification, even when no such user exists. Skipping it would return in
  // microseconds for unknown emails and ~50ms for known ones, which is a reliable account
  // enumeration oracle.
  const hash = user?.passwordHash ?? DUMMY_HASH;
  const valid = await verifyPassword(hash, input.password);

  if (!user || !valid) return null;

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return { id: user.id, email: user.email, displayName: user.displayName, role: user.role };
}

/**
 * Move a guest's attempts onto a registered account.
 *
 * This is what makes guest-first testing work: someone takes the test, sees their result, and
 * only then decides to create an account — at which point the result they already saw follows
 * them rather than being lost.
 */
export async function claimGuestAttempts(userId: string, guestKey: string): Promise<number> {
  const result = await prisma.attempt.updateMany({
    where: { guestKey, userId: null },
    // The database enforces that exactly one of userId/guestKey is set, so guestKey must be
    // cleared in the same statement.
    data: { userId, guestKey: null },
  });
  return result.count;
}

export interface AttemptSummary {
  id: string;
  submittedAt: string;
  mode: string;
  iq: number;
  iqLower: number;
  iqUpper: number;
  percentile: number;
  confidence: string;
  correctCount: number;
  totalCount: number;
  rapidGuessing: boolean;
}

/** A user's submitted attempts, newest first. */
export async function getAttemptHistory(userId: string): Promise<AttemptSummary[]> {
  const attempts = await prisma.attempt.findMany({
    where: { userId, status: "SUBMITTED" },
    orderBy: { submittedAt: "desc" },
    select: {
      id: true,
      submittedAt: true,
      mode: true,
      iqScore: true,
      iqLower: true,
      iqUpper: true,
      percentile: true,
      confidence: true,
      correctCount: true,
      totalCount: true,
      rapidGuessing: true,
    },
  });

  return attempts
    .filter((a) => a.submittedAt !== null && a.iqScore !== null)
    .map((a) => ({
      id: a.id,
      submittedAt: a.submittedAt!.toISOString(),
      mode: a.mode,
      iq: a.iqScore!,
      iqLower: a.iqLower ?? a.iqScore!,
      iqUpper: a.iqUpper ?? a.iqScore!,
      percentile: a.percentile ?? 50,
      confidence: a.confidence ?? "LOW",
      correctCount: a.correctCount ?? 0,
      totalCount: a.totalCount ?? 0,
      rapidGuessing: a.rapidGuessing,
    }));
}

export interface DashboardStats {
  attemptCount: number;
  averageIq: number | null;
  bestIq: number | null;
  latestIq: number | null;
  /** Difference between the most recent and the first attempt, when there are at least two. */
  trend: number | null;
  categoryPerformance: {
    slug: string;
    name: string;
    aboveAverage: number;
    average: number;
    belowAverage: number;
    accuracy: number;
    totalItems: number;
  }[];
  /**
   * Comparisons against published country / profession reference figures. Null when the user has
   * not recorded that detail or we hold no figure for it. These use external, differently-scaled
   * data and are presented as light reference points with visible caveats — see
   * `src/core/reference/`.
   */
  countryComparison: ScoreComparison | null;
  professionComparison: ScoreComparison | null;
}

export async function getDashboardStats(userId: string): Promise<DashboardStats> {
  const attempts = await prisma.attempt.findMany({
    where: { userId, status: "SUBMITTED", iqScore: { not: null } },
    orderBy: { submittedAt: "asc" },
    select: { iqScore: true },
  });

  const scores = attempts.map((a) => a.iqScore).filter((s): s is number => s !== null);

  const categoryScores = await prisma.categoryScore.findMany({
    where: { attempt: { userId, status: "SUBMITTED" } },
    select: {
      band: true,
      correctCount: true,
      totalCount: true,
      category: { select: { slug: true, name: true, sortOrder: true } },
    },
  });

  const grouped = new Map<
    string,
    {
      name: string;
      sortOrder: number;
      aboveAverage: number;
      average: number;
      belowAverage: number;
      correct: number;
      total: number;
    }
  >();

  for (const row of categoryScores) {
    const entry = grouped.get(row.category.slug) ?? {
      name: row.category.name,
      sortOrder: row.category.sortOrder,
      aboveAverage: 0,
      average: 0,
      belowAverage: 0,
      correct: 0,
      total: 0,
    };

    if (row.band === "ABOVE_AVERAGE") entry.aboveAverage += 1;
    else if (row.band === "BELOW_AVERAGE") entry.belowAverage += 1;
    else entry.average += 1;

    entry.correct += row.correctCount;
    entry.total += row.totalCount;
    grouped.set(row.category.slug, entry);
  }

  const categoryPerformance = [...grouped.entries()]
    .sort((a, b) => a[1].sortOrder - b[1].sortOrder)
    .map(([slug, entry]) => ({
      slug,
      name: entry.name,
      aboveAverage: entry.aboveAverage,
      average: entry.average,
      belowAverage: entry.belowAverage,
      accuracy: entry.total === 0 ? 0 : entry.correct / entry.total,
      totalItems: entry.total,
    }));

  const first = scores[0];
  const latest = scores[scores.length - 1];
  const averageIq =
    scores.length === 0 ? null : Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);

  // Compare the user's typical (average) score against their country and profession. The average
  // is used rather than the latest so a single unusual attempt does not swing the comparison.
  const profile = await prisma.user.findUnique({
    where: { id: userId },
    select: { nationality: true, profession: true },
  });

  const countryComparison =
    averageIq === null ? null : compareToCountry(averageIq, profile?.nationality ?? null);
  const professionComparison =
    averageIq === null ? null : compareToProfession(averageIq, profile?.profession ?? null);

  return {
    attemptCount: scores.length,
    averageIq,
    bestIq: scores.length === 0 ? null : Math.max(...scores),
    latestIq: latest ?? null,
    trend:
      scores.length >= 2 && first !== undefined && latest !== undefined ? latest - first : null,
    categoryPerformance,
    countryComparison,
    professionComparison,
  };
}
