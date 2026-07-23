import { cn } from "@/lib/utils";
import { IQ_MAX, IQ_MIN } from "@/core/psychometrics/scoring";

/**
 * The headline result: a point estimate shown inside its confidence interval.
 *
 * This is the most important visual in the product, and the interval is not decoration. A single
 * number invites the reader to treat it as exact; drawing the range the estimate actually occupies
 * makes the precision of the measurement visible at a glance. The interval is therefore rendered
 * as a wide band and the point as a thin marker on top of it — the band is the honest object, the
 * point is a summary of it.
 */
export function ScoreScale({
  iq,
  lower,
  upper,
  className,
}: {
  iq: number;
  lower: number;
  upper: number;
  className?: string;
}) {
  const width = 560;
  const height = 74;
  const padding = 24;
  const trackY = 40;
  const trackHeight = 12;
  const plotWidth = width - padding * 2;

  const toX = (value: number): number => {
    const clamped = Math.max(IQ_MIN, Math.min(IQ_MAX, value));
    return padding + ((clamped - IQ_MIN) / (IQ_MAX - IQ_MIN)) * plotWidth;
  };

  const lowerX = toX(lower);
  const upperX = toX(upper);
  const pointX = toX(iq);
  const ticks = [55, 70, 85, 100, 115, 130, 145];

  return (
    <figure className={cn("m-0", className)}>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[380px]" aria-hidden="true" focusable="false">
          <rect
            x={padding}
            y={trackY - trackHeight / 2}
            width={plotWidth}
            height={trackHeight}
            rx={trackHeight / 2}
            fill="var(--color-surface-sunken)"
          />

          {/* The confidence interval — the honest extent of the estimate. */}
          <rect
            x={lowerX}
            y={trackY - trackHeight / 2}
            width={Math.max(upperX - lowerX, 4)}
            height={trackHeight}
            rx={trackHeight / 2}
            fill="var(--color-accent)"
            opacity="0.35"
          />

          {/* Point estimate. A 2px surface ring keeps it legible where it overlaps the band. */}
          <rect
            x={pointX - 2.5}
            y={trackY - trackHeight / 2 - 6}
            width={5}
            height={trackHeight + 12}
            rx={2.5}
            fill="var(--color-accent)"
            stroke="var(--color-surface-raised)"
            strokeWidth="2"
          />

          {/* Population mean reference. */}
          <line
            x1={toX(100)}
            y1={trackY - trackHeight / 2 - 10}
            x2={toX(100)}
            y2={trackY + trackHeight / 2 + 10}
            stroke="var(--color-content-subtle)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />

          {ticks.map((tick) => (
            <text
              key={tick}
              x={toX(tick)}
              y={height - 6}
              textAnchor="middle"
              fontSize="11"
              fill="var(--color-content-subtle)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {tick}
            </text>
          ))}
        </svg>
      </div>

      <figcaption className="sr-only">
        Estimated score {iq}, with a 95% confidence interval from {lower} to {upper}. The scale runs
        from {IQ_MIN} to {IQ_MAX}, with the population average at 100.
      </figcaption>
    </figure>
  );
}
