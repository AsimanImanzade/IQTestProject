"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import { Card, CardTitle } from "@/components/ui/card";
import { Figure } from "@/components/figure";
import { Verdict } from "@/components/verdict";
import { cn, formatElapsed } from "@/lib/utils";

/**
 * Per-question review.
 *
 * The teaching surface of the product: every question is shown with the correct answer, a worked
 * explanation, and — the part that makes it genuinely useful — the *rationale for each distractor*,
 * naming the specific reasoning error that leads there. That is only possible because the
 * generators record the error model they built each wrong option from.
 */

interface ReviewChoice {
  id: string;
  text: string | null;
  svg: string | null;
  isCorrect: boolean;
  rationale: string | null;
  wasSelected: boolean;
}

interface ReviewItem {
  position: number;
  questionId: string;
  category: string;
  difficulty: number;
  stem: string;
  svg: string | null;
  explanation: string;
  wasCorrect: boolean;
  responseMs: number;
  flagged: boolean;
  selectedChoiceId: string | null;
  choices: ReviewChoice[];
}

type Filter = "all" | "incorrect" | "flagged";

export function ReviewList({ items, className }: { items: ReviewItem[]; className?: string }) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const incorrectCount = items.filter((i) => !i.wasCorrect).length;
  const flaggedCount = items.filter((i) => i.flagged).length;

  const visible = items.filter((item) => {
    if (filter === "incorrect") return !item.wasCorrect;
    if (filter === "flagged") return item.flagged;
    return true;
  });

  function toggle(position: number) {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      return next;
    });
  }

  const filters: { value: Filter; label: string }[] = [
    { value: "all" as const, label: t("results.reviewAll", { count: items.length }) },
    { value: "incorrect" as const, label: t("results.reviewIncorrect", { count: incorrectCount }) },
    { value: "flagged" as const, label: t("results.reviewFlagged", { count: flaggedCount }) },
  ];

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>{t("results.reviewTitle")}</CardTitle>

        {/* Filters sit in one row above the content. */}
        <div className="flex gap-1.5" role="group" aria-label={t("results.filterQuestions")}>
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
              className={cn(
                "h-9 rounded-lg border px-3 text-xs font-medium transition-colors",
                filter === option.value
                  ? "border-accent bg-accent-soft text-content"
                  : "border-border text-content-muted hover:border-border-strong hover:text-content",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-6 text-sm text-content-muted">
          {filter === "incorrect"
            ? t("results.allCorrect")
            : t("results.noFlagged")}
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {visible.map((item) => {
            const isOpen = expanded.has(item.position);
            return (
              <li key={item.questionId} className="rounded-xl border border-border">
                <button
                  type="button"
                  onClick={() => toggle(item.position)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-sunken text-sm font-medium tabular-nums">
                    {item.position + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.category}</span>
                    <span className="block text-xs text-content-subtle">
                      {t("results.difficultyLabel", { level: item.difficulty })} · {formatElapsed(item.responseMs)}
                      {item.flagged ? " · " + t("runner.flagged") : ""}
                    </span>
                  </span>

                  {/* Icon + word, never colour alone. */}
                  <Verdict
                    tone={item.wasCorrect ? "positive" : "negative"}
                    label={item.wasCorrect ? t("results.correct") : t("results.incorrect")}
                  />

                  <svg
                    viewBox="0 0 24 24"
                    className={cn(
                      "h-4 w-4 shrink-0 text-content-subtle transition-transform",
                      isOpen && "rotate-180",
                    )}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {isOpen ? (
                  <div className="border-t border-border p-4">
                    <p className="whitespace-pre-wrap text-[0.95rem] leading-relaxed">{item.stem}</p>

                    {item.svg ? (
                      <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                        <Figure svg={item.svg} />
                      </div>
                    ) : null}

                    <ul className="mt-4 space-y-2">
                      {item.choices.map((choice) => {
                        const state = choice.isCorrect
                          ? "correct"
                          : choice.wasSelected
                            ? "chosen-wrong"
                            : "neutral";

                        return (
                          <li
                            key={choice.id}
                            className={cn(
                              "rounded-lg border p-3",
                              state === "correct" && "border-positive/45 bg-positive-soft",
                              state === "chosen-wrong" && "border-negative/45 bg-negative-soft",
                              state === "neutral" && "border-border",
                            )}
                          >
                            <div className="flex items-start gap-3">
                              {choice.svg ? (
                                <span className="block w-20 shrink-0">
                                  <Figure svg={choice.svg} className="py-0" />
                                </span>
                              ) : (
                                <span className="flex-1 text-sm">{choice.text}</span>
                              )}

                              <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
                                {choice.isCorrect ? (
                                  <Verdict tone="positive" label={t("results.correctAnswer")} />
                                ) : null}
                                {choice.wasSelected && !choice.isCorrect ? (
                                  <Verdict tone="negative" label={t("results.yourAnswer")} />
                                ) : null}
                              </span>
                            </div>

                            {choice.rationale ? (
                              <p className="mt-2 text-xs leading-relaxed text-content-muted">
                                {choice.rationale}
                              </p>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>

                    <div className="mt-4 rounded-lg border-l-2 border-accent bg-surface-sunken p-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-content-subtle">
                        {t("results.explanation")}
                      </h4>
                      <p className="mt-1.5 text-sm leading-relaxed text-content-muted">
                        {item.explanation}
                      </p>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
