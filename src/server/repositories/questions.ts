import { prisma } from "../db";
import type { CategorySlug } from "@/core/types";
import type { SamplerCandidate } from "@/core/blueprint/sampler";

/**
 * Question bank access.
 *
 * The single most important thing in this file is `toClientChoice`. Prisma's `Choice` model
 * carries `isCorrect`, and returning a `Choice` row from an API route — even nested three levels
 * inside another object — hands the answer key to anyone who opens the network tab. Every path
 * that sends question data to a test-taker goes through the projection below, and an integration
 * test asserts the delivered payload contains no `isCorrect` anywhere.
 */

export interface ClientChoice {
  id: string;
  text: string | null;
  svg: string | null;
}

export interface ClientQuestion {
  id: string;
  position: number;
  category: { slug: string; name: string };
  stem: string;
  svg: string | null;
  estimatedSeconds: number;
  choices: ClientChoice[];
}

/**
 * Resolve a localized value stored as {base column, i18n JSON}. Falls back to the base (English)
 * whenever the requested locale is missing — so a partially translated row is never blank.
 */
export function pickLocalized(
  base: string | null,
  i18n: unknown,
  locale: string,
): string | null {
  if (i18n && typeof i18n === "object") {
    const value = (i18n as Record<string, unknown>)[locale];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return base;
}

/** Strip a stored choice down to what a test-taker may see, in the requested locale. */
export function toClientChoice(
  choice: { id: string; text: string | null; textI18n?: unknown; svg: string | null },
  locale: string,
): ClientChoice {
  return { id: choice.id, text: pickLocalized(choice.text, choice.textI18n, locale), svg: choice.svg };
}

/** Lightweight pool used by the blueprint sampler. */
export interface PoolEntry extends SamplerCandidate {
  choiceCount: number;
}

/**
 * The sampler needs the whole published pool on every test start. That is a few hundred narrow
 * rows, so it is cached briefly rather than re-queried per request — the bank changes only when
 * an administrator publishes items.
 */
const POOL_TTL_MS = 60_000;

const poolCacheByLocale = new Map<string, { entries: PoolEntry[]; loadedAt: number }>();

/**
 * The published pool for a locale, cached briefly. Only questions fully available in the requested
 * language are returned (via `locales`), so a test assembled in Azerbaijani never contains an item
 * that would fall back to English mid-question.
 */
export async function getQuestionPool(locale = "en", force = false): Promise<PoolEntry[]> {
  const cached = poolCacheByLocale.get(locale);
  if (!force && cached && Date.now() - cached.loadedAt < POOL_TTL_MS) {
    return cached.entries;
  }

  const rows = await prisma.question.findMany({
    where: { status: "PUBLISHED", locales: { has: locale } },
    select: {
      id: true,
      difficulty: true,
      category: { select: { slug: true } },
      _count: { select: { choices: true } },
    },
  });

  const entries: PoolEntry[] = rows.map((row) => ({
    questionId: row.id,
    category: row.category.slug as CategorySlug,
    difficulty: row.difficulty,
    choiceCount: row._count.choices,
  }));

  poolCacheByLocale.set(locale, { entries, loadedAt: Date.now() });
  return entries;
}

export function invalidatePoolCache(): void {
  poolCacheByLocale.clear();
}

/** Full question records, including the answer key and every localization. Server-side use only. */
export async function getQuestionsWithChoices(ids: readonly string[]) {
  return prisma.question.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      stem: true,
      stemI18n: true,
      svg: true,
      difficulty: true,
      irtA: true,
      irtB: true,
      irtC: true,
      explanation: true,
      explanationI18n: true,
      estimatedSeconds: true,
      category: { select: { slug: true, name: true } },
      choices: {
        orderBy: { ordinal: "asc" },
        select: {
          id: true, ordinal: true, text: true, textI18n: true, svg: true,
          isCorrect: true, rationale: true, rationaleI18n: true,
        },
      },
    },
  });
}

export async function countPublishedQuestions(): Promise<number> {
  return prisma.question.count({ where: { status: "PUBLISHED" } });
}
