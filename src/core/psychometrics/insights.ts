/**
 * Narrative feedback: strengths, weaknesses and recommendations.
 *
 * These are generated from the scored results by explicit rules, not written by a language model.
 * That is a deliberate choice for a measurement product: the feedback has to be traceable to the
 * numbers it came from, and it must never assert more than those numbers support. Every statement
 * below is gated on having enough items to justify it.
 */

import type { CategorySlug, ScoredResponse } from "../types";
import { getCategory } from "../types";
import type { CategoryResult } from "./categories";
import type { TestScore } from "./scoring";
import { bandOf } from "../types";
import type { Locale } from "../i18n";

/** Category names in Azerbaijani, lower-cased for use mid-sentence. */
const CATEGORY_NAME_AZ: Record<CategorySlug, string> = {
  "matrix-reasoning": "matris mühakiməsi",
  "number-series": "ədəd ardıcıllıqları",
  "pattern-recognition": "naxış tanıma",
  "visual-sequences": "vizual ardıcıllıqlar",
  "shape-rotation": "fiqur fırlatma",
  "spatial-reasoning": "fəza təsəvvürü",
  "deductive-logic": "deduktiv məntiq",
  "logical-reasoning": "məntiqi mühakimə",
  analogies: "analogiyalar",
  classification: "təsnifat",
  "odd-one-out": "artıq olanı tapma",
  "quantitative-reasoning": "kəmiyyət mühakiməsi",
};

export interface DifficultyBreakdown {
  band: "easy" | "medium" | "hard" | "very-hard";
  correctCount: number;
  totalCount: number;
  accuracy: number;
}

export interface Insights {
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  difficultyBreakdown: DifficultyBreakdown[];
  /** Caveats about what this particular result can and cannot support. */
  caveats: string[];
}

/**
 * Minimum items before a category is described as a strength or weakness at all.
 * Two items is a coin flip; calling that a "strength" would be noise dressed as insight.
 */
const MIN_ITEMS_FOR_CLAIM = 3;

function categoryName(slug: CategorySlug, locale: Locale): string {
  return locale === "az" ? CATEGORY_NAME_AZ[slug] : getCategory(slug).name.toLowerCase();
}

export function buildInsights(
  score: TestScore,
  categories: readonly CategoryResult[],
  responses: readonly ScoredResponse[],
  locale: Locale = "en",
): Insights {
  const az = locale === "az";
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const recommendations: string[] = [];
  const caveats: string[] = [];

  const reportable = categories.filter((c) => c.totalCount >= MIN_ITEMS_FOR_CLAIM);

  for (const category of reportable) {
    const name = categoryName(category.category, locale);
    if (category.band === "ABOVE_AVERAGE") {
      strengths.push(
        az
          ? `Güclü ${name} — ${category.totalCount} sualdan ${category.correctCount}-i düzgün.`
          : `Strong ${name} — ${category.correctCount} of ${category.totalCount} correct.`,
      );
    } else if (category.band === "BELOW_AVERAGE") {
      weaknesses.push(
        az
          ? `${capitalise(name)} daha zəif sahə oldu — ${category.totalCount} sualdan ${category.correctCount}-i düzgün.`
          : `${capitalise(name)} was the weaker area — ${category.correctCount} of ${category.totalCount} correct.`,
      );
      recommendations.push(
        az
          ? `${capitalise(name)} suallarını məşq edin; səhv etdiklərinizin izahlarını nəzərdən keçirmək hələ istifadə etmədiyiniz qaydanı görməyin ən sürətli yoludur.`
          : `Practise ${name} items; reviewing the worked explanations for the ones you missed is the fastest way to see the pattern you are not yet using.`,
      );
    }
  }

  // Categories that were seen but with too few items to judge.
  const tooFew = categories.filter((c) => c.totalCount < MIN_ITEMS_FOR_CLAIM);
  if (tooFew.length > 0) {
    caveats.push(
      az
        ? `${tooFew.length} kateqoriya ${MIN_ITEMS_FOR_CLAIM}-dən az sualla təmsil olundu ki, bu da ayrıca şərh üçün çox azdır.`
        : `${tooFew.length} categor${tooFew.length === 1 ? "y was" : "ies were"} represented by fewer than ${MIN_ITEMS_FOR_CLAIM} questions, which is too few to comment on individually.`,
    );
  }

  if (strengths.length === 0 && weaknesses.length === 0) {
    strengths.push(
      az
        ? "Nəticə kateqoriyalar üzrə sabit oldu, aydın zirvə və ya enmə yoxdur."
        : "Performance was consistent across categories, with no clear peak or dip.",
    );
  }

  // --- difficulty breakdown ---------------------------------------------
  const difficultyBreakdown = buildDifficultyBreakdown(responses);

  const hardBands = difficultyBreakdown.filter(
    (b) => (b.band === "hard" || b.band === "very-hard") && b.totalCount > 0,
  );
  const hardCorrect = hardBands.reduce((s, b) => s + b.correctCount, 0);
  const hardTotal = hardBands.reduce((s, b) => s + b.totalCount, 0);

  if (hardTotal >= 4) {
    const hardAccuracy = hardCorrect / hardTotal;
    if (hardAccuracy >= 0.6) {
      strengths.push(
        az
          ? `Ən çətin suallarda yaxşı nəticə göstərdiniz — çətin olması nəzərdə tutulan ${hardTotal} sualdan ${hardCorrect}-i düzgün.`
          : `Held up well on the hardest questions — ${hardCorrect} of ${hardTotal} correct on items designed to be difficult.`,
      );
    } else if (hardAccuracy <= 0.2) {
      recommendations.push(
        az
          ? "Ən çox bal ən çətin suallarda itirildi. Bunlar adətən iki-üç qaydanı birləşdirir, ona görə variantlara baxmadan əvvəl hər qaydanı ayrıca adlandırmağa çalışın."
          : "The hardest items were where most marks were lost. These usually combine two or three rules at once, so try naming each rule separately before looking at the options.",
      );
    }
  }

  // --- pace --------------------------------------------------------------
  const meanSeconds = score.meanResponseMs / 1000;
  if (score.rapidGuessing.detected) {
    caveats.push(
      az
        ? "Bir çox sual çox sürətli — real oxunma sürətindən də sürətli — cavablandırıldı. Bu nəticə əsl mühakimə qabiliyyətinizi əks etdirməyə bilər və etibarlılıq reytinqi müvafiq olaraq aşağı salınıb."
        : "Many questions were answered very quickly — faster than they can realistically be read. This result is unlikely to reflect your actual reasoning ability, and the confidence rating has been lowered accordingly.",
    );
    recommendations.push(
      az
        ? "Testi tələsmədən yenidən keçin; qiymət daha mənalı olacaq."
        : "Retake the test unhurried; the estimate will be far more meaningful.",
    );
  } else if (meanSeconds > 0 && meanSeconds < 20) {
    recommendations.push(
      az
        ? `Hər suala orta hesabla ${meanSeconds.toFixed(0)} saniyə sərf etdiniz. Bir az daha çox vaxt sərf etmək, xüsusən çətin suallarda, adətən dəqiqliyi nəzərəçarpacaq dərəcədə artırır.`
        : `You averaged ${meanSeconds.toFixed(0)} seconds per question. Spending a little longer, particularly on the harder items, usually raises accuracy noticeably.`,
    );
  }

  // --- precision ---------------------------------------------------------
  if (score.confidence === "LOW" && !score.rapidGuessing.detected) {
    caveats.push(
      az
        ? "Cavablar dəqiq qiymətə oturuşmadı, ona görə göstərilən aralıq genişdir. Fərqli suallarla ikinci cəhd onu daraldardı."
        : "The responses did not settle on a precise estimate, so the range shown is wide. A second attempt with a different set of questions would narrow it.",
    );
  }

  if (score.clamped) {
    caveats.push(
      az
        ? "Qiymət 20 suallıq testin ayırd edə biləcəyi həddə çatdı, ona görə həddən kənar deyil, həddin özündə göstərilir."
        : "The estimate reached the limit of what a 20-question test can resolve, so it is reported at the boundary rather than beyond it.",
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      az
        ? "Aydın zəif sahə yoxdur. Qiyməti daha da dəqiqləşdirmək üçün yenidən test keçin — fərqli sual dəsti mühakimənin bir az fərqli hissəsini ölçür."
        : "Nothing stands out as a weak area. To push the estimate further, take another test — a different question mix measures a slightly different slice of reasoning.",
    );
  }

  return { strengths, weaknesses, recommendations, difficultyBreakdown, caveats };
}

function buildDifficultyBreakdown(responses: readonly ScoredResponse[]): DifficultyBreakdown[] {
  const bands: DifficultyBreakdown["band"][] = ["easy", "medium", "hard", "very-hard"];
  const counters = new Map<string, { correct: number; total: number }>(
    bands.map((b) => [b, { correct: 0, total: 0 }]),
  );

  for (const response of responses) {
    // Recover designed difficulty from the IRT difficulty parameter, inverting difficultyToB.
    const difficulty = Math.round(response.parameters.b / 0.55 + 5.5);
    const clamped = Math.min(10, Math.max(1, difficulty));
    const band = bandOf(clamped);
    const counter = counters.get(band);
    if (!counter) continue;
    counter.total += 1;
    if (response.correct) counter.correct += 1;
  }

  return bands.map((band) => {
    const counter = counters.get(band) ?? { correct: 0, total: 0 };
    return {
      band,
      correctCount: counter.correct,
      totalCount: counter.total,
      accuracy: counter.total === 0 ? 0 : counter.correct / counter.total,
    };
  });
}

function capitalise(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}
