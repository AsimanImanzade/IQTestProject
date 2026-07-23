/**
 * Item validation — the gate every generated question must pass before it can enter the bank.
 *
 * This runs at seed time and again in CI. A single malformed item in a psychometric instrument is
 * worse than a missing one: it silently biases every ability estimate that touches it, and the
 * test-taker has no way to know. So the rule is fail loudly, never repair quietly.
 */

import type { GeneratedItem, LocalizedString } from "../types";
import { CATEGORY_SLUGS } from "../types";
import { LOCALES, localize, type Locale } from "../i18n";

export interface ValidationIssue {
  code:
    | "no-correct-answer"
    | "multiple-correct-answers"
    | "duplicate-choices"
    | "too-few-choices"
    | "empty-choice"
    | "empty-stem"
    | "empty-explanation"
    | "difficulty-out-of-range"
    | "unknown-category"
    | "duplicate-signature"
    | "invalid-timing"
    | "malformed-svg";
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

/** Content key for a choice — what "two options are the same" means. */
function choiceKey(choice: { text?: LocalizedString; svg?: string }, locale: Locale): string {
  const text = choice.text ? localize(choice.text, locale) : "";
  return `${text} ${choice.svg ?? ""}`;
}

/**
 * Validate a single item in isolation.
 * Signature de-duplication is bank-wide and therefore handled separately, by `BankValidator`.
 */
export function validateItem(item: GeneratedItem): ValidationResult {
  const issues: ValidationIssue[] = [];

  const correct = item.choices.filter((c) => c.isCorrect);
  if (correct.length === 0) {
    issues.push({ code: "no-correct-answer", message: "Item has no correct choice." });
  } else if (correct.length > 1) {
    issues.push({
      code: "multiple-correct-answers",
      message: `Item has ${correct.length} choices marked correct; exactly one is required.`,
    });
  }

  if (item.choices.length < 4) {
    issues.push({
      code: "too-few-choices",
      message: `Item has ${item.choices.length} choices; at least 4 are required.`,
    });
  }

  for (const locale of LOCALES) {
    const keys = item.choices.map((c) => choiceKey(c, locale));
    if (new Set(keys).size !== keys.length) {
      issues.push({ code: "duplicate-choices", message: `Two or more choices have identical content in "${locale}", so more than one answer is defensible.` });
      break;
    }
  }

  for (const choice of item.choices) {
    const hasText = choice.text !== undefined && localize(choice.text, "en").trim().length > 0;
    const hasSvg = typeof choice.svg === "string" && choice.svg.trim().length > 0;
    if (!hasText && !hasSvg) {
      issues.push({ code: "empty-choice", message: "A choice has neither text nor a figure." });
      break;
    }
  }

  if (localize(item.stem, "en").trim().length === 0) {
    issues.push({ code: "empty-stem", message: "Item stem is empty." });
  }

  if (localize(item.explanation, "en").trim().length < 10) {
    issues.push({
      code: "empty-explanation",
      message: "Item has no usable explanation; the review screen would show nothing.",
    });
  }

  if (!Number.isInteger(item.difficulty) || item.difficulty < 1 || item.difficulty > 10) {
    issues.push({
      code: "difficulty-out-of-range",
      message: `Difficulty ${item.difficulty} is outside the 1..10 authoring scale.`,
    });
  }

  if (!(CATEGORY_SLUGS as readonly string[]).includes(item.category)) {
    issues.push({ code: "unknown-category", message: `Unknown category "${item.category}".` });
  }

  if (!Number.isFinite(item.estimatedSeconds) || item.estimatedSeconds <= 0) {
    issues.push({
      code: "invalid-timing",
      message: `Estimated solving time ${item.estimatedSeconds} is not a positive number.`,
    });
  }

  // Generated SVG is inserted into the page, so unbalanced markup would break the layout.
  for (const markup of [item.svg, ...item.choices.map((c) => c.svg)]) {
    if (!markup) continue;
    if (!markup.startsWith("<svg") || !markup.endsWith("</svg>")) {
      issues.push({ code: "malformed-svg", message: "Figure markup is not a complete <svg> element." });
      break;
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Bank-wide validator. Tracks signatures across every item so the same question cannot appear
 * twice, even when produced by different generators or separate seed runs.
 */
export class BankValidator {
  readonly #signatures = new Set<string>();
  #accepted = 0;
  readonly #rejections = new Map<string, number>();

  /** Returns true when the item is well-formed and not a duplicate. */
  accept(item: GeneratedItem): ValidationResult {
    const result = validateItem(item);

    if (result.valid && this.#signatures.has(item.signature)) {
      result.issues.push({
        code: "duplicate-signature",
        message: `An item with signature ${item.signature} is already in the bank.`,
      });
      result.valid = false;
    }

    if (result.valid) {
      this.#signatures.add(item.signature);
      this.#accepted += 1;
    } else {
      for (const issue of result.issues) {
        this.#rejections.set(issue.code, (this.#rejections.get(issue.code) ?? 0) + 1);
      }
    }

    return result;
  }

  get acceptedCount(): number {
    return this.#accepted;
  }

  /** Rejection counts by issue code — surfaced in the seed report so problems are visible. */
  get rejectionSummary(): Record<string, number> {
    return Object.fromEntries(this.#rejections);
  }
}
