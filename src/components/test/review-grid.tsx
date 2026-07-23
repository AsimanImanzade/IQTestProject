"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";
import type { AnswerState, ClientQuestion } from "./test-runner";

/**
 * The pre-submission review screen.
 *
 * Shown before grading so nobody submits with unanswered questions they meant to return to.
 * Unanswered items are counted as incorrect by the scoring model, so surfacing them here is a
 * fairness measure, not a convenience.
 */
export function ReviewGrid({
  questions,
  answers,
  onJump,
  onSubmit,
  onBack,
  submitting,
  error,
}: {
  questions: ClientQuestion[];
  answers: Record<string, AnswerState>;
  onJump: (index: number) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
  error: string | null;
}) {
  const t = useT();
  const unanswered = questions.filter((q) => !answers[q.id]?.choiceId);
  const flagged = questions.filter((q) => answers[q.id]?.flagged);

  return (
    <section>
      <h1 className="text-2xl font-semibold tracking-tight">{t("runner.reviewTitle")}</h1>
      <p className="mt-2 text-content-muted">
        {unanswered.length === 0
          ? t("runner.reviewAllAnswered")
          : t("runner.reviewSomeUnanswered", { count: unanswered.length })}
      </p>

      <ul className="mt-6 grid grid-cols-5 gap-2.5 sm:grid-cols-10">
        {questions.map((question, index) => {
          const answer = answers[question.id];
          const answered = Boolean(answer?.choiceId);
          const isFlagged = Boolean(answer?.flagged);

          return (
            <li key={question.id}>
              <button
                type="button"
                onClick={() => onJump(index)}
                aria-label={`${t("runner.question")} ${index + 1}: ${answered ? t("runner.legendAnswered") : t("runner.legendUnanswered")}${isFlagged ? ", " + t("runner.flagged") : ""}`}
                className={cn(
                  "relative grid h-11 w-full place-items-center rounded-lg border text-sm font-medium transition-colors",
                  answered
                    ? "border-accent bg-accent-soft text-content"
                    : "border-border bg-surface-raised text-content-subtle hover:border-border-strong",
                )}
              >
                {index + 1}
                {isFlagged ? (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-caution ring-2 ring-surface"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap gap-4 text-xs text-content-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-accent bg-accent-soft" aria-hidden="true" /> {t("runner.legendAnswered")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded border border-border bg-surface-raised" aria-hidden="true" /> {t("runner.legendUnanswered")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-caution" aria-hidden="true" /> {t("runner.legendFlagged", { count: flagged.length })}
        </span>
      </div>

      {error ? (
        <p role="alert" className="mt-5 rounded-lg border border-negative/40 bg-negative-soft px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
        <Button variant="secondary" onClick={onBack}>
          {t("runner.backToQuestions")}
        </Button>
        <Button size="lg" onClick={onSubmit} disabled={submitting}>
          {submitting ? t("runner.scoring") : t("runner.submit")}
        </Button>
      </div>
    </section>
  );
}
