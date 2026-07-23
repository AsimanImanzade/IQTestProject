"use client";

import { useEffect, useRef, useState } from "react";
import { cn, formatDuration } from "@/lib/utils";
import { useT } from "@/i18n/client";

/**
 * Countdown for timed mode.
 *
 * This display is presentation only — the real deadline lives on the attempt row and is enforced
 * server-side, so stopping this timer in devtools grants no extra time.
 *
 * Remaining time is derived from the absolute expiry instant on every tick rather than by
 * decrementing a counter, so a backgrounded tab (where browsers throttle timers heavily) still
 * shows the correct time when it returns to the foreground.
 */
export function CountdownTimer({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire: () => void;
}) {
  const t = useT();
  // Derived straight from the prop rather than held in a ref: the deadline is a pure function of
  // expiresAt, so there is nothing to store and nothing to keep in sync.
  const deadline = new Date(expiresAt).getTime();

  const [remainingMs, setRemainingMs] = useState(() => Math.max(0, deadline - Date.now()));
  const fired = useRef(false);

  useEffect(() => {
    const interval = setInterval(() => {
      const remaining = Math.max(0, deadline - Date.now());
      setRemainingMs(remaining);

      if (remaining === 0 && !fired.current) {
        fired.current = true;
        onExpire();
      }
    }, 500);

    return () => clearInterval(interval);
  }, [deadline, onExpire]);

  const seconds = Math.ceil(remainingMs / 1000);
  const critical = seconds <= 60;
  const low = seconds <= 300;

  return (
    <div className="flex items-center gap-2">
      <svg
        viewBox="0 0 24 24"
        className={cn("h-4 w-4", critical ? "text-negative" : "text-content-subtle")}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="9" />
        <path strokeLinecap="round" d="M12 7.5V12l3 2" />
      </svg>

      <span
        className={cn(
          "text-sm font-semibold tabular-nums",
          critical ? "text-negative" : low ? "text-caution" : "text-content",
        )}
      >
        {formatDuration(seconds)}
      </span>

      {/*
        Announced politely and only at minute boundaries (plus the final ten seconds). Announcing
        every tick would make the page unusable with a screen reader.
      */}
      <span aria-live="polite" aria-atomic="true" className="sr-only">
        {seconds % 60 === 0
          ? t("runner.minutesLeft", { count: seconds / 60 })
          : seconds <= 10
            ? t("runner.secondsLeft", { count: seconds })
            : ""}
      </span>
    </div>
  );
}
