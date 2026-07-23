"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/**
 * Status indicator: icon + text label + colour, always all three.
 *
 * This component exists specifically so that correct/incorrect and the ability bands can never be
 * rendered as colour alone. Measured with the dataviz validator, the positive green and negative
 * red in this palette are ΔE ~4 apart under deuteranopia and protanopia — effectively identical
 * for roughly one in twelve men. No hue choice fixes a good/bad pair; the distinct glyph and the
 * word are what actually carry the meaning, and the colour is reinforcement.
 *
 * Consequently: never render a bare coloured dot for these states, and never drop the label to
 * save space.
 */

type Tone = "positive" | "negative" | "caution" | "neutral";

const TONES: Record<Tone, { wrapper: string; icon: string }> = {
  positive: { wrapper: "border-positive/40 bg-positive-soft", icon: "text-positive" },
  negative: { wrapper: "border-negative/40 bg-negative-soft", icon: "text-negative" },
  caution: { wrapper: "border-caution/40 bg-caution-soft", icon: "text-caution" },
  neutral: { wrapper: "border-border bg-surface-sunken", icon: "text-content-subtle" },
};

function Glyph({ tone, className }: { tone: Tone; className?: string }) {
  const shared = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className,
  };

  // Distinct shapes, not just distinct colours — this is the part a colour-blind reader relies on.
  switch (tone) {
    case "positive":
      return (
        <svg {...shared}>
          <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
        </svg>
      );
    case "negative":
      return (
        <svg {...shared}>
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      );
    case "caution":
      return (
        <svg {...shared}>
          <path d="M12 4.5 21 19.5H3L12 4.5Z" />
          <path d="M12 10v4M12 17v.1" />
        </svg>
      );
    default:
      return (
        <svg {...shared}>
          <circle cx="12" cy="12" r="8" />
          <path d="M8.5 12h7" />
        </svg>
      );
  }
}

export function Verdict({
  tone,
  label,
  className,
}: {
  tone: Tone;
  label: string;
  className?: string;
}) {
  const styles = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium",
        styles.wrapper,
        className,
      )}
    >
      <Glyph tone={tone} className={cn("h-3.5 w-3.5 shrink-0", styles.icon)} />
      {label}
    </span>
  );
}

/** Map an ability band onto a verdict. */
export function BandVerdict({ band, className }: { band: string; className?: string }) {
  const t = useT();
  if (band === "ABOVE_AVERAGE") return <Verdict tone="positive" label={t("bands.aboveAverage")} className={className} />;
  if (band === "BELOW_AVERAGE") return <Verdict tone="caution" label={t("bands.belowAverage")} className={className} />;
  return <Verdict tone="neutral" label={t("bands.average")} className={className} />;
}
