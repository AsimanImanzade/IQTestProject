"use client";

import { Figure } from "@/components/figure";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { ClientQuestion } from "./test-runner";

/**
 * A single question.
 *
 * Options are a real radiogroup rather than a list of buttons, so screen readers announce
 * "option 2 of 4, selected" and arrow keys work natively. Difficulty is deliberately never shown
 * during the test: telling someone an item is "very hard" changes how they approach it and adds
 * construct-irrelevant variance to the measurement.
 */
export function QuestionCard({
  question,
  selectedChoiceId,
  flagged,
  onSelect,
  onToggleFlag,
}: {
  question: ClientQuestion;
  selectedChoiceId: string | null;
  flagged: boolean;
  onSelect: (choiceId: string) => void;
  onToggleFlag: () => void;
}) {
  const t = useT();
  const allChoicesAreFigures = question.choices.every((c) => c.svg);

  return (
    <article>
      <div className="flex items-start justify-between gap-4">
        <span className="rounded-lg bg-surface-sunken px-2.5 py-1 text-xs font-medium text-content-muted">
          {t(`categories.${question.category.slug}`)}
        </span>

        <button
          type="button"
          onClick={onToggleFlag}
          aria-pressed={flagged}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
            flagged
              ? "border-caution bg-caution-soft text-content"
              : "border-border text-content-muted hover:border-border-strong hover:text-content",
          )}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={flagged ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 21V4h13l-2.5 4L18 12H5" />
          </svg>
          {flagged ? t("runner.flagged") : t("runner.flag")}
        </button>
      </div>

      <h1 className="mt-5 whitespace-pre-wrap text-xl leading-relaxed font-medium">
        {question.stem}
      </h1>

      {question.svg ? (
        <div className="mt-6 rounded-[--radius-card] border border-border bg-surface-raised p-5">
          <Figure svg={question.svg} />
        </div>
      ) : null}

      <div
        role="radiogroup"
        aria-label={t("runner.answerOptions")}
        className={cn(
          "mt-7 gap-3",
          allChoicesAreFigures ? "grid grid-cols-2 sm:grid-cols-4" : "grid grid-cols-1",
        )}
      >
        {question.choices.map((choice, position) => {
          const selected = choice.id === selectedChoiceId;
          return (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(choice.id)}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl border p-4 text-left transition-colors",
                "min-h-[3.5rem]",
                selected
                  ? "border-accent bg-accent-soft"
                  : "border-border bg-surface-raised hover:border-border-strong hover:bg-surface-sunken",
                allChoicesAreFigures && "flex-col items-center justify-center gap-2",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-xs font-semibold",
                  selected
                    ? "border-accent bg-accent text-accent-content"
                    : "border-border text-content-subtle",
                )}
              >
                {position + 1}
              </span>

              {choice.svg ? (
                <span className="block w-full max-w-[120px]">
                  <Figure svg={choice.svg} className="py-0" />
                </span>
              ) : (
                <span className="text-[0.98rem] leading-relaxed">{choice.text}</span>
              )}
            </button>
          );
        })}
      </div>
    </article>
  );
}
