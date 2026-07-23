"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/client";
import { QuestionCard } from "./question-card";
import { ReviewGrid } from "./review-grid";
import { CountdownTimer } from "./countdown-timer";

interface ClientChoice {
  id: string;
  text: string | null;
  svg: string | null;
}

interface ClientQuestion {
  id: string;
  position: number;
  category: { slug: string; name: string };
  stem: string;
  svg: string | null;
  estimatedSeconds: number;
  choices: ClientChoice[];
}

interface SavedResponse {
  questionId: string;
  selectedChoiceId: string | null;
  flagged: boolean;
  responseMs: number;
}

export interface RunnerAttempt {
  attemptId: string;
  mode: string;
  startedAt: string;
  expiresAt: string | null;
  durationSeconds: number | null;
  totalQuestions: number;
  questions: ClientQuestion[];
  responses: SavedResponse[];
}

interface AnswerState {
  choiceId: string | null;
  flagged: boolean;
  accumulatedMs: number;
}

export function TestRunner({ attempt }: { attempt: RunnerAttempt }) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const t = useT();

  const [index, setIndex] = useState(0);
  const [reviewing, setReviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [focusWarning, setFocusWarning] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, AnswerState>>(() => {
    const initial: Record<string, AnswerState> = {};
    for (const question of attempt.questions) {
      const saved = attempt.responses.find((r) => r.questionId === question.id);
      initial[question.id] = {
        choiceId: saved?.selectedChoiceId ?? null,
        flagged: saved?.flagged ?? false,
        accumulatedMs: saved?.responseMs ?? 0,
      };
    }
    return initial;
  });

  const current = attempt.questions[index];
  const total = attempt.questions.length;

  // Time spent on the *current* question, so a per-item response time can be recorded.
  // Initialised to 0 rather than Date.now(): calling an impure function during render produces a
  // value that silently changes on any re-render. The effect below sets it on mount and on every
  // question change, which is the only moment it should move.
  const enteredAt = useRef<number>(0);
  useEffect(() => {
    enteredAt.current = Date.now();
  }, [index]);

  /**
   * Milliseconds spent on the current question. Returns 0 while `enteredAt` is still unset,
   * which would otherwise compute an elapsed time measured from the Unix epoch.
   */
  const elapsedOnQuestion = useCallback(
    () => (enteredAt.current === 0 ? 0 : Date.now() - enteredAt.current),
    [],
  );

  const answeredCount = useMemo(
    () => Object.values(answers).filter((a) => a.choiceId !== null).length,
    [answers],
  );

  /** Persist one answer. Failures are non-fatal: the answer stays in local state and is retried. */
  const persist = useCallback(
    async (questionId: string, state: AnswerState, extraMs: number) => {
      try {
        await fetch(`/api/attempts/${attempt.attemptId}/responses`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId,
            choiceId: state.choiceId,
            responseMs: Math.round(state.accumulatedMs + extraMs),
            flagged: state.flagged,
          }),
        });
      } catch {
        // Offline or a dropped request. The final submit re-reads server state, and any answer
        // that never persisted simply counts as unanswered — which the scoring model handles.
      }
    },
    [attempt.attemptId],
  );

  const selectChoice = useCallback(
    (choiceId: string) => {
      if (!current) return;
      const elapsed = elapsedOnQuestion();

      setAnswers((previous) => {
        const existing = previous[current.id] ?? {
          choiceId: null,
          flagged: false,
          accumulatedMs: 0,
        };
        // Toggle off when re-selecting the same option, so an answer can be withdrawn.
        const next: AnswerState = {
          ...existing,
          choiceId: existing.choiceId === choiceId ? null : choiceId,
        };
        void persist(current.id, next, elapsed);
        return { ...previous, [current.id]: next };
      });
    },
    [current, persist, elapsedOnQuestion],
  );

  const toggleFlag = useCallback(() => {
    if (!current) return;
    const elapsed = elapsedOnQuestion();

    setAnswers((previous) => {
      const existing = previous[current.id] ?? {
        choiceId: null,
        flagged: false,
        accumulatedMs: 0,
      };
      const next: AnswerState = { ...existing, flagged: !existing.flagged };
      void persist(current.id, next, elapsed);
      return { ...previous, [current.id]: next };
    });
  }, [current, persist, elapsedOnQuestion]);

  /** Bank the time spent on the current question before navigating away from it. */
  const bankTime = useCallback(() => {
    if (!current) return;
    const elapsed = elapsedOnQuestion();
    setAnswers((previous) => {
      const existing = previous[current.id];
      if (!existing) return previous;
      return {
        ...previous,
        [current.id]: { ...existing, accumulatedMs: existing.accumulatedMs + elapsed },
      };
    });
  }, [current, elapsedOnQuestion]);

  const goTo = useCallback(
    (target: number) => {
      if (target < 0 || target >= total) return;
      bankTime();
      setReviewing(false);
      setIndex(target);
    },
    [bankTime, total],
  );

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    bankTime();

    // Flush the current question's time before grading.
    if (current) {
      const state = answers[current.id];
      if (state) await persist(current.id, state, elapsedOnQuestion());
    }

    try {
      const response = await fetch(`/api/attempts/${attempt.attemptId}/submit`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setSubmitError(payload?.error?.message ?? t("runner.submitError"));
        setSubmitting(false);
        return;
      }
      router.push(`/results/${attempt.attemptId}`);
    } catch {
      setSubmitError(t("runner.submitNetworkError"));
      setSubmitting(false);
    }
  }, [answers, attempt.attemptId, bankTime, current, persist, router, submitting, elapsedOnQuestion, t]);

  // --- anti-cheat: tab switching -----------------------------------------
  // Recorded as a signal on the attempt, never used to void a test — switching tabs has plenty of
  // innocent explanations, and a false accusation is worse than a noisy signal.
  useEffect(() => {
    let count = 0;

    function onVisibilityChange() {
      if (document.visibilityState !== "hidden") return;
      count += 1;
      void fetch(`/api/attempts/${attempt.attemptId}/focus-loss`, { method: "POST" }).catch(
        () => undefined,
      );
      setFocusWarning(
        count === 1
          ? t("runner.tabWarningFirst")
          : t("runner.tabWarningRepeat", { count }),
      );
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [attempt.attemptId, t]);

  // --- keyboard shortcuts -------------------------------------------------
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      // Never hijack keys while the user is typing in a field.
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (event.key === "ArrowRight") {
        event.preventDefault();
        goTo(index + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goTo(index - 1);
      } else if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFlag();
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        void submit();
      } else if (/^[1-5]$/.test(event.key)) {
        const choice = current?.choices[Number(event.key) - 1];
        if (choice) {
          event.preventDefault();
          selectChoice(choice.id);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, goTo, index, selectChoice, submit, toggleFlag]);

  const progress = ((index + 1) / total) * 100;

  if (!current) return null;

  const currentAnswer = answers[current.id];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* --- fixed header: progress, counters, timer --- */}
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto max-w-3xl px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-medium tabular-nums">
              {t("runner.question")} {index + 1}
              <span className="text-content-subtle"> / {total}</span>
            </div>

            <div className="flex items-center gap-4">
              <span className="hidden text-sm text-content-muted sm:inline">
                {t("runner.answered", { answered: answeredCount, left: total - answeredCount })}
              </span>
              {attempt.expiresAt ? (
                <CountdownTimer expiresAt={attempt.expiresAt} onExpire={submit} />
              ) : null}
            </div>
          </div>

          <div
            className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={index + 1}
            aria-label={`${t("runner.question")} ${index + 1} / ${total}`}
          >
            <motion.div
              className="h-full rounded-full bg-accent"
              initial={false}
              animate={{ width: `${progress}%` }}
              transition={reduceMotion ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 30 }}
            />
          </div>
        </div>
      </header>

      {focusWarning ? (
        <div role="status" className="border-b border-caution/40 bg-caution-soft px-5 py-2.5 text-center text-sm">
          {focusWarning}
        </div>
      ) : null}

      {/* --- question --- */}
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        {reviewing ? (
          <ReviewGrid
            questions={attempt.questions}
            answers={answers}
            onJump={goTo}
            onSubmit={submit}
            onBack={() => setReviewing(false)}
            submitting={submitting}
            error={submitError}
          />
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={current.id}
              initial={reduceMotion ? false : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -24 }}
              transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
            >
              <QuestionCard
                question={current}
                selectedChoiceId={currentAnswer?.choiceId ?? null}
                flagged={currentAnswer?.flagged ?? false}
                onSelect={selectChoice}
                onToggleFlag={toggleFlag}
              />
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {/* --- navigation --- */}
      {!reviewing ? (
        <footer className="sticky bottom-0 border-t border-border bg-surface/85 backdrop-blur">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-5 py-3">
            <Button variant="secondary" onClick={() => goTo(index - 1)} disabled={index === 0}>
              <span aria-hidden="true">←</span> {t("runner.previous")}
            </Button>

            <span className="hidden text-xs text-content-subtle sm:block">
              {t("runner.keyboardHint")}
            </span>

            {index === total - 1 ? (
              <Button onClick={() => { bankTime(); setReviewing(true); }}>{t("runner.reviewAnswers")}</Button>
            ) : (
              <Button onClick={() => goTo(index + 1)}>
                {t("runner.next")} <span aria-hidden="true">→</span>
              </Button>
            )}
          </div>
        </footer>
      ) : null}
    </div>
  );
}

export type { ClientQuestion, AnswerState };
