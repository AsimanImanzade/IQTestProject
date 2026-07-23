import { cn } from "@/lib/utils";

/**
 * Horizontal bar chart for a single measure across labelled categories.
 *
 * Deliberately hand-built rather than pulled from a charting library, for three reasons: it
 * server-renders with zero client JavaScript, it uses the app's own design tokens directly, and
 * it lets the mark specs be exactly right.
 *
 * Design decisions, following the dataviz method:
 *   * ONE hue for every bar. The bars encode one measure (accuracy), so they are a single series;
 *     colouring each category differently would imply an identity distinction that is not there.
 *   * Every bar is directly labelled with its value, so the chart is readable without the axis.
 *   * A real <table> carries the same numbers for screen readers, and the SVG is aria-hidden —
 *     a chart read aloud as a list of path elements is worse than useless.
 *   * The value never appears in the series colour; it stays in ink tokens.
 */

export interface BarDatum {
  label: string;
  /** Fraction 0..1 driving bar length. */
  value: number;
  /** Text shown at the end of the bar, e.g. "3 / 4". */
  display: string;
  /** Optional qualitative note rendered beside the label. */
  note?: string;
}

export function BarChart({
  data,
  caption,
  className,
}: {
  data: BarDatum[];
  caption: string;
  className?: string;
}) {
  if (data.length === 0) return null;

  const rowHeight = 34;
  const barHeight = 10;
  const labelWidth = 168;
  const valueWidth = 62;
  const width = 560;
  const plotWidth = width - labelWidth - valueWidth;
  const height = data.length * rowHeight;

  return (
    <figure className={cn("m-0", className)}>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[420px]"
          aria-hidden="true"
          focusable="false"
        >
          {/* Baseline: recessive, and the only axis line the chart needs. */}
          <line
            x1={labelWidth}
            y1={0}
            x2={labelWidth}
            y2={height}
            stroke="var(--color-border)"
            strokeWidth="1"
          />

          {data.map((datum, index) => {
            const y = index * rowHeight;
            const centre = y + rowHeight / 2;
            const clamped = Math.max(0, Math.min(1, datum.value));
            const barWidth = Math.max(clamped * plotWidth, clamped > 0 ? 3 : 0);

            return (
              <g key={datum.label}>
                <text
                  x={labelWidth - 12}
                  y={centre}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize="13"
                  fill="var(--color-content-muted)"
                >
                  {datum.label}
                </text>

                {/* Track showing the full scale, so a short bar still reads as "out of 100%". */}
                <rect
                  x={labelWidth}
                  y={centre - barHeight / 2}
                  width={plotWidth}
                  height={barHeight}
                  rx={barHeight / 2}
                  fill="var(--color-surface-sunken)"
                />

                {/* 4px rounded data-end, anchored to the baseline. */}
                <rect
                  x={labelWidth}
                  y={centre - barHeight / 2}
                  width={barWidth}
                  height={barHeight}
                  rx={barHeight / 2}
                  fill="var(--color-accent)"
                />

                <text
                  x={labelWidth + plotWidth + 12}
                  y={centre}
                  dominantBaseline="central"
                  fontSize="13"
                  fontWeight="500"
                  fill="var(--color-content)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {datum.display}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* The accessible equivalent — same numbers, real semantics. */}
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Score</th>
            {data.some((d) => d.note) ? <th scope="col">Assessment</th> : null}
          </tr>
        </thead>
        <tbody>
          {data.map((datum) => (
            <tr key={datum.label}>
              <th scope="row">{datum.label}</th>
              <td>{datum.display}</td>
              {data.some((d) => d.note) ? <td>{datum.note ?? ""}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
