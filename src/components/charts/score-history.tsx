import { cn, formatDate } from "@/lib/utils";
import { IQ_MAX, IQ_MIN } from "@/core/psychometrics/scoring";

/**
 * Score history over attempts — a single series over time.
 *
 * One series, so no legend: the title names it. The confidence interval of each attempt is drawn
 * as a vertical whisker, which is the point of the chart — without it a reader would treat a
 * three-point jump between attempts as improvement, when the intervals almost certainly overlap.
 */

export interface HistoryPoint {
  date: string;
  iq: number;
  lower: number;
  upper: number;
}

export function ScoreHistory({
  points,
  className,
}: {
  points: HistoryPoint[];
  className?: string;
}) {
  if (points.length === 0) return null;

  const width = 640;
  const height = 220;
  const padding = { top: 16, right: 20, bottom: 34, left: 40 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // A fixed domain keeps successive dashboards visually comparable, and stops a two-point
  // difference filling the whole chart.
  const minScore = Math.max(IQ_MIN, Math.min(...points.map((p) => p.lower)) - 5);
  const maxScore = Math.min(IQ_MAX, Math.max(...points.map((p) => p.upper)) + 5);
  const span = Math.max(maxScore - minScore, 20);

  const toX = (index: number): number =>
    points.length === 1
      ? padding.left + plotWidth / 2
      : padding.left + (index / (points.length - 1)) * plotWidth;

  const toY = (score: number): number =>
    padding.top + plotHeight - ((score - minScore) / span) * plotHeight;

  const gridValues = [minScore, minScore + span / 2, maxScore].map(Math.round);
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(p.iq)}`).join(" ");

  return (
    <figure className={cn("m-0", className)}>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[420px]" aria-hidden="true" focusable="false">
          {/* Recessive gridlines. */}
          {gridValues.map((value) => (
            <g key={value}>
              <line
                x1={padding.left}
                y1={toY(value)}
                x2={width - padding.right}
                y2={toY(value)}
                stroke="var(--color-border)"
                strokeWidth="1"
              />
              <text
                x={padding.left - 8}
                y={toY(value)}
                textAnchor="end"
                dominantBaseline="central"
                fontSize="11"
                fill="var(--color-content-subtle)"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {value}
              </text>
            </g>
          ))}

          {/* Confidence whiskers, drawn under the line. */}
          {points.map((point, index) => (
            <line
              key={`ci-${point.date}-${index}`}
              x1={toX(index)}
              y1={toY(point.upper)}
              x2={toX(index)}
              y2={toY(point.lower)}
              stroke="var(--color-accent)"
              strokeWidth="6"
              strokeLinecap="round"
              opacity="0.28"
            />
          ))}

          {points.length > 1 ? (
            <path d={linePath} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" />
          ) : null}

          {/* Markers >= 8px, with a 2px surface ring so they stay legible over the whisker. */}
          {points.map((point, index) => (
            <circle
              key={`pt-${point.date}-${index}`}
              cx={toX(index)}
              cy={toY(point.iq)}
              r="4.5"
              fill="var(--color-accent)"
              stroke="var(--color-surface-raised)"
              strokeWidth="2"
            />
          ))}

          {/* Label only the first and last point — never a number on every point. */}
          {[0, points.length - 1]
            .filter((index, position, all) => all.indexOf(index) === position)
            .map((index) => {
              const point = points[index];
              if (!point) return null;
              return (
                <text
                  key={`lbl-${index}`}
                  x={toX(index)}
                  y={height - 12}
                  textAnchor={points.length === 1 ? "middle" : index === 0 ? "start" : "end"}
                  fontSize="11"
                  fill="var(--color-content-subtle)"
                >
                  {formatDate(point.date)}
                </text>
              );
            })}
        </svg>
      </div>

      <table className="sr-only">
        <caption>Estimated score for each completed test, with its 95% confidence interval</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            <th scope="col">Score</th>
            <th scope="col">Interval</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point, index) => (
            <tr key={`${point.date}-${index}`}>
              <th scope="row">{formatDate(point.date)}</th>
              <td>{point.iq}</td>
              <td>
                {point.lower} to {point.upper}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
