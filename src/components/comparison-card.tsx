"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/client";

/**
 * Shows how the user's score sits against a published reference average (country or profession).
 *
 * The design carries the honesty requirement visually, not just in the copy: the two figures are
 * shown on a shared mini-scale so the reader sees they are *close*, the difference is stated
 * plainly, and the source plus caveat sit directly beneath — never tucked away. The reference is a
 * different instrument on a different scale, so nothing here is framed as a precise ranking.
 */

interface Comparison {
  kind: "country" | "profession";
  groupLabel: string;
  userScore: number;
  referenceAverage: number;
  difference: number;
  direction: "above" | "below" | "at";
  sourceName: string;
  sourceYear?: number;
  caveat: string;
}

export function ComparisonCard({
  title,
  comparison,
  className,
}: {
  title: string;
  comparison: Comparison;
  className?: string;
}) {
  const t = useT();
  const { userScore, referenceAverage, difference, direction } = comparison;

  // A shared scale spanning both values with a little margin, so the two markers are comparable.
  const lo = Math.min(userScore, referenceAverage) - 12;
  const hi = Math.max(userScore, referenceAverage) + 12;
  const span = Math.max(hi - lo, 1);
  const pos = (value: number) => ((value - lo) / span) * 100;

  const magnitude = Math.abs(difference);
  const summary =
    direction === "at"
      ? t("comparison.atAverage", { group: comparison.groupLabel })
      : direction === "above"
        ? t("comparison.pointsAbove", { n: magnitude, group: comparison.groupLabel })
        : t("comparison.pointsBelow", { n: magnitude, group: comparison.groupLabel });

  return (
    <Card className={className}>
      <CardTitle>{title}</CardTitle>

      <p className="mt-2 text-sm text-content-muted">{summary}</p>

      {/*
        Shared mini-scale. The two labels sit on OPPOSITE sides of the track — reference above,
        the user below — so they never collide even when the two scores are identical and both
        markers land at the same position.
      */}
      <div className="mt-9 mb-8">
        <div className="relative h-2 rounded-full bg-surface-sunken">
          <Marker percent={pos(referenceAverage)} tone="muted" label={t("comparison.avg", { value: referenceAverage })} side="above" />
          <Marker percent={pos(userScore)} tone="accent" label={t("comparison.you", { value: userScore })} side="below" />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-between text-sm">
        <span className="text-content-muted">
          {t("comparison.groupAverage", { group: comparison.groupLabel })}{" "}
          <strong className="font-semibold text-content tabular-nums">{referenceAverage}</strong>
        </span>
        <span
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-semibold",
            direction === "above" && "bg-positive-soft text-positive",
            direction === "below" && "bg-caution-soft text-caution",
            direction === "at" && "bg-surface-sunken text-content-muted",
          )}
        >
          {t("comparison.vsAverage", { delta: `${difference > 0 ? "+" : ""}${difference}` })}
        </span>
      </div>

      <p className="mt-5 border-t border-border pt-3 text-xs leading-relaxed text-content-subtle">
        {t("comparison.source", {
          source: comparison.kind === "country" ? t("comparison.countrySource") : t("comparison.professionSource"),
          caveat: comparison.kind === "country" ? t("comparison.countryCaveat") : t("comparison.professionCaveat"),
        })}
      </p>
    </Card>
  );
}

function Marker({
  percent,
  tone,
  label,
  side,
}: {
  percent: number;
  tone: "accent" | "muted";
  label: string;
  side: "above" | "below";
}) {
  const clamped = Math.max(2, Math.min(98, percent));
  return (
    <div
      className={cn(
        "absolute -top-1.5 flex items-center",
        side === "above" ? "flex-col-reverse" : "flex-col",
      )}
      style={{ left: `${clamped}%`, transform: "translateX(-50%)" }}
    >
      <span
        className={cn(
          "h-5 w-1.5 rounded-full ring-2 ring-surface-raised",
          tone === "accent" ? "bg-accent" : "bg-border-strong",
        )}
      />
      <span
        className={cn(
          "whitespace-nowrap text-[0.7rem] font-medium tabular-nums",
          side === "above" ? "mb-1.5" : "mt-1.5",
          tone === "accent" ? "text-accent" : "text-content-subtle",
        )}
      >
        {label}
      </span>
    </div>
  );
}
