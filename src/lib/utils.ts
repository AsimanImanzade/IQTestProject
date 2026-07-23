import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes, letting later classes override earlier ones correctly. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** "8:05" style clock for the countdown. */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Spoken form of a duration, for screen-reader announcements. */
export function describeDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  if (minutes === 0) return `${seconds} second${seconds === 1 ? "" : "s"} remaining`;
  if (seconds === 0) return `${minutes} minute${minutes === 1 ? "" : "s"} remaining`;
  return `${minutes} minute${minutes === 1 ? "" : "s"} and ${seconds} seconds remaining`;
}

/** "1m 42s" style elapsed time for results. */
export function formatElapsed(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function formatPercent(value: number, digits = 0): string {
  return `${(value * 100).toFixed(digits)}%`;
}

/**
 * Percentile as a percentage, e.g. "88%". Rendered as a percentage rather than an English ordinal
 * ("88th") so it reads correctly in every language — the surrounding copy says "scored higher than
 * approximately X".
 */
export function formatPercentile(percentile: number): string {
  return `${Math.round(percentile)}%`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
