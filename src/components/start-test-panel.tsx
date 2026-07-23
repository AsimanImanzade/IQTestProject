"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { DemographicsFields, type DemographicsValue } from "@/components/demographics-fields";
import { useT } from "@/i18n/client";
import { cn } from "@/lib/utils";

type Mode = "TIMED" | "UNTIMED";

export interface StartPanelUser {
  signedIn: boolean;
  /** Age derived from the stored birth year; null when the profile is incomplete. */
  ageYears: number | null;
}

export function StartTestPanel({
  user,
  className,
}: {
  user: StartPanelUser;
  className?: string;
}) {
  const router = useRouter();
  const t = useT();
  const [mode, setMode] = useState<Mode>("TIMED");
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demographics, setDemographics] = useState<DemographicsValue>({
    age: "",
    gender: "",
    educationLevel: "",
  });

  const MODES: { value: Mode; title: string; description: string }[] = [
    { value: "TIMED", title: t("start.timedTitle"), description: t("start.timedBody") },
    { value: "UNTIMED", title: t("start.untimedTitle"), description: t("start.untimedBody") },
  ];

  // A signed-in person states their age once on their profile and is never asked again; a guest
  // has nowhere to store it, so they are asked at the start of each test.
  const needsProfile = user.signedIn && user.ageYears === null;
  const asksDemographics = !user.signedIn;

  async function start() {
    if (asksDemographics) {
      const age = Number(demographics.age);
      if (!Number.isInteger(age) || age < 12 || age > 100) {
        setError(t("start.ageError"));
        return;
      }
    }

    setStarting(true);
    setError(null);

    try {
      const response = await fetch("/api/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          // Ignored by the server for signed-in users, whose profile is authoritative.
          ...(asksDemographics
            ? {
                demographics: {
                  ageYears: Number(demographics.age),
                  gender: demographics.gender || null,
                  educationLevel: demographics.educationLevel || null,
                },
              }
            : {}),
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error?.message ?? t("start.startError"));
        setStarting(false);
        return;
      }

      router.push(`/test/${payload.attemptId}`);
    } catch {
      setError(t("start.networkError"));
      setStarting(false);
    }
  }

  if (needsProfile) {
    return (
      <div
        className={cn(
          "rounded-[--radius-card] border border-caution/40 bg-caution-soft p-6",
          className,
        )}
      >
        <h2 className="text-sm font-semibold">{t("start.profileNeededTitle")}</h2>
        <p className="mt-2 text-sm leading-relaxed text-content-muted">
          {t("start.profileNeededBody")}
        </p>
        <Link
          href="/profile?next=/"
          className="mt-4 inline-flex h-12 items-center rounded-xl bg-accent px-6 font-medium text-accent-content transition-colors hover:bg-accent-hover"
        >
          {t("start.completeProfile")}
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("rounded-[--radius-card] border border-border bg-surface-raised p-6", className)}>
      <fieldset>
        <legend className="text-sm font-semibold">{t("start.chooseHow")}</legend>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {MODES.map((option) => {
            const selected = mode === option.value;
            return (
              <label
                key={option.value}
                className={cn(
                  "relative cursor-pointer rounded-xl border p-4 transition-colors",
                  selected
                    ? "border-accent bg-accent-soft"
                    : "border-border hover:border-border-strong",
                )}
              >
                <input
                  type="radio"
                  name="mode"
                  value={option.value}
                  checked={selected}
                  onChange={() => setMode(option.value)}
                  className="sr-only"
                />
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded-full border-2",
                      selected ? "border-accent" : "border-border-strong",
                    )}
                  >
                    {selected ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
                  </span>
                  <span className="font-medium">{option.title}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-content-muted">
                  {option.description}
                </p>
              </label>
            );
          })}
        </div>
      </fieldset>

      {asksDemographics ? (
        <fieldset className="mt-6 border-t border-border pt-5">
          <legend className="sr-only">{t("start.aboutYou")}</legend>
          <h3 className="text-sm font-semibold">{t("start.aboutYou")}</h3>
          <p className="mt-1 text-sm text-content-muted">{t("start.aboutYouBody")}</p>
          <DemographicsFields
            value={demographics}
            onChange={setDemographics}
            className="mt-4"
          />
        </fieldset>
      ) : (
        <p className="mt-5 rounded-xl border border-border bg-surface px-4 py-3 text-sm text-content-muted">
          {t("start.usingProfileAge", { age: user.ageYears ?? "" })}{" "}
          <Link href="/profile" className="font-medium text-accent hover:underline">
            {t("start.updateProfile")}
          </Link>
        </p>
      )}

      {error ? (
        <motion.p
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          role="alert"
          className="mt-4 rounded-lg border border-negative/40 bg-negative-soft px-4 py-3 text-sm text-content"
        >
          {error}
        </motion.p>
      ) : null}

      <Button size="lg" className="mt-5 w-full" onClick={start} disabled={starting}>
        {starting ? t("start.preparing") : t("common.beginTest")}
      </Button>

      {!user.signedIn ? (
        <p className="mt-3 text-center text-xs text-content-subtle">
          {t("start.noAccountNeeded")}
        </p>
      ) : null}
    </div>
  );
}
