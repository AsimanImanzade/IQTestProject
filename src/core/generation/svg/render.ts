/**
 * Deterministic SVG rendering for figural items.
 *
 * Every figure is computed geometry — there are no image files to host, nothing to upload, and
 * the same figure always produces byte-identical markup (asserted by a unit test), which is what
 * makes the whole bank reproducible.
 *
 * All strokes and fills use `currentColor`, so figures inherit the surrounding text colour and
 * are automatically correct in both light and dark themes.
 */

import type { Count, Figure, Fill, Shape, Size } from "./figure";

const CELL = 100;

/** Circumradius by size. Using a common circumradius keeps different shapes visually comparable. */
const SIZE_RADIUS: Record<Size, number> = {
  small: 28,
  medium: 37,
  large: 46,
};

/** Layout of N repeated elements inside one cell: positions plus a shrink factor. */
const COUNT_LAYOUT: Record<Count, { positions: readonly (readonly [number, number])[]; scale: number }> = {
  1: { positions: [[50, 50]], scale: 1 },
  2: { positions: [[31, 50], [69, 50]], scale: 0.54 },
  3: { positions: [[50, 30], [31, 68], [69, 68]], scale: 0.48 },
  4: { positions: [[32, 32], [68, 32], [32, 68], [68, 68]], scale: 0.46 },
};

/** Fixed precision keeps output byte-identical across platforms and float implementations. */
function n(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  // Avoid "-0" and trailing ".00" noise in the markup.
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

function polygonPoints(cx: number, cy: number, r: number, sides: number, startDeg: number): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = ((startDeg + (360 / sides) * i) * Math.PI) / 180;
    pts.push(`${n(cx + r * Math.cos(angle))},${n(cy + r * Math.sin(angle))}`);
  }
  return pts.join(" ");
}

function starPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  const inner = r * 0.42;
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? r : inner;
    const angle = ((-90 + 36 * i) * Math.PI) / 180;
    pts.push(`${n(cx + radius * Math.cos(angle))},${n(cy + radius * Math.sin(angle))}`);
  }
  return pts.join(" ");
}

function crossPoints(cx: number, cy: number, r: number): string {
  // A plus sign inscribed in the circumradius; arm half-width is a third of the reach.
  const a = r * 0.36;
  const b = r * 0.95;
  const coords: readonly (readonly [number, number])[] = [
    [-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a],
    [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a],
  ];
  return coords.map(([x, y]) => `${n(cx + x)},${n(cy + y)}`).join(" ");
}

/**
 * Pattern/gradient definitions for textured fills.
 *
 * IDs are global and stable rather than randomised: identical ids always carry identical
 * definitions, so even when several figures appear on one page the browser resolving to the
 * first definition is harmless. Randomised ids would break byte-identical determinism.
 */
const DEFS = `<defs>` +
  `<pattern id="iqHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
  `<line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" stroke-width="2"/></pattern>` +
  `<pattern id="iqDots" width="7" height="7" patternUnits="userSpaceOnUse">` +
  `<circle cx="3.5" cy="3.5" r="1.6" fill="currentColor"/></pattern>` +
  `<linearGradient id="iqHalf" x1="0" y1="0" x2="1" y2="0">` +
  `<stop offset="50%" stop-color="currentColor"/>` +
  `<stop offset="50%" stop-color="currentColor" stop-opacity="0"/></linearGradient>` +
  `</defs>`;

function fillAttrs(fill: Fill): string {
  switch (fill) {
    case "none":
      return `fill="none"`;
    case "solid":
      return `fill="currentColor"`;
    case "hatch":
      return `fill="url(#iqHatch)"`;
    case "dots":
      return `fill="url(#iqDots)"`;
    case "half":
      return `fill="url(#iqHalf)"`;
    default: {
      const exhaustive: never = fill;
      throw new Error(`Unhandled fill: ${String(exhaustive)}`);
    }
  }
}

function shapeElement(shape: Shape, cx: number, cy: number, r: number, fill: Fill): string {
  const attrs = `${fillAttrs(fill)} stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"`;
  switch (shape) {
    case "circle":
      return `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${attrs}/>`;
    case "square":
      return `<polygon points="${polygonPoints(cx, cy, r, 4, 45)}" ${attrs}/>`;
    case "triangle":
      return `<polygon points="${polygonPoints(cx, cy, r, 3, -90)}" ${attrs}/>`;
    case "diamond":
      return `<polygon points="${polygonPoints(cx, cy, r, 4, -90)}" ${attrs}/>`;
    case "pentagon":
      return `<polygon points="${polygonPoints(cx, cy, r, 5, -90)}" ${attrs}/>`;
    case "hexagon":
      return `<polygon points="${polygonPoints(cx, cy, r, 6, -90)}" ${attrs}/>`;
    case "star":
      return `<polygon points="${starPoints(cx, cy, r)}" ${attrs}/>`;
    case "cross":
      return `<polygon points="${crossPoints(cx, cy, r)}" ${attrs}/>`;
    default: {
      const exhaustive: never = shape;
      throw new Error(`Unhandled shape: ${String(exhaustive)}`);
    }
  }
}

/** Render a figure's contents into a 100x100 coordinate box (no <svg> wrapper). */
export function figureBody(figure: Figure): string {
  const layout = COUNT_LAYOUT[figure.count];
  const radius = SIZE_RADIUS[figure.size] * layout.scale;

  const parts = layout.positions.map(([cx, cy]) => {
    const element = shapeElement(figure.shape, cx, cy, radius, figure.fill);
    if (figure.rotation === 0) return element;
    return `<g transform="rotate(${figure.rotation} ${n(cx)} ${n(cy)})">${element}</g>`;
  });

  return parts.join("");
}

function svgWrapper(width: number, height: number, body: string, label: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `role="img" aria-label="${escapeXml(label)}" class="iq-figure">` +
    DEFS +
    body +
    `</svg>`
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A single figure, as used for an answer option. */
export function renderFigure(figure: Figure, label = "Answer option figure"): string {
  return svgWrapper(CELL, CELL, figureBody(figure), label);
}

function cellFrame(x: number, y: number): string {
  return (
    `<rect x="${n(x + 3)}" y="${n(y + 3)}" width="${n(CELL - 6)}" height="${n(CELL - 6)}" ` +
    `fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.28" rx="6"/>`
  );
}

function questionMark(x: number, y: number): string {
  return (
    `<text x="${n(x + CELL / 2)}" y="${n(y + CELL / 2)}" text-anchor="middle" ` +
    `dominant-baseline="central" font-size="40" font-weight="600" fill="currentColor" ` +
    `font-family="ui-sans-serif, system-ui, sans-serif">?</text>`
  );
}

/**
 * A 3x3 matrix with the bottom-right cell missing.
 * `cells` is row-major; a null entry renders as the question mark.
 */
export function renderMatrix(cells: readonly (Figure | null)[], label: string): string {
  if (cells.length !== 9) throw new Error(`renderMatrix expects 9 cells, received ${cells.length}`);
  const gap = 8;
  const total = CELL * 3 + gap * 2;

  const body = cells
    .map((figure, index) => {
      const row = Math.floor(index / 3);
      const col = index % 3;
      const x = col * (CELL + gap);
      const y = row * (CELL + gap);
      const inner = figure ? figureBody(figure) : questionMark(0, 0);
      return `<g transform="translate(${n(x)} ${n(y)})">${cellFrame(0, 0)}${inner}</g>`;
    })
    .join("");

  return svgWrapper(total, total, body, label);
}

/**
 * A horizontal sequence of figures. When `withQuestionMark` is true an extra cell holding "?"
 * is appended, which is how visual-sequence and pattern items pose the question.
 */
export function renderSequence(
  figures: readonly Figure[],
  label: string,
  withQuestionMark = true,
): string {
  const gap = 10;
  const cellCount = figures.length + (withQuestionMark ? 1 : 0);
  const width = CELL * cellCount + gap * (cellCount - 1);

  const drawn = figures.map((figure, index) => {
    const x = index * (CELL + gap);
    return `<g transform="translate(${n(x)} 0)">${cellFrame(0, 0)}${figureBody(figure)}</g>`;
  });

  if (withQuestionMark) {
    const x = figures.length * (CELL + gap);
    drawn.push(`<g transform="translate(${n(x)} 0)">${cellFrame(0, 0)}${questionMark(0, 0)}</g>`);
  }

  return svgWrapper(width, CELL, drawn.join(""), label);
}

/**
 * An analogy layout: A : B :: C : ?
 * Rendered as two pairs separated by the conventional "::" marker.
 */
export function renderAnalogy(a: Figure, b: Figure, c: Figure, label: string): string {
  const gap = 10;
  const sep = 34;
  const width = CELL * 4 + gap * 2 + sep * 2;

  const cellAt = (x: number, inner: string): string =>
    `<g transform="translate(${n(x)} 0)">${cellFrame(0, 0)}${inner}</g>`;

  const marker = (x: number, text: string): string =>
    `<text x="${n(x + sep / 2)}" y="${n(CELL / 2)}" text-anchor="middle" ` +
    `dominant-baseline="central" font-size="26" font-weight="600" fill="currentColor" ` +
    `opacity="0.75" font-family="ui-sans-serif, system-ui, sans-serif">${text}</text>`;

  let x = 0;
  const parts: string[] = [];
  parts.push(cellAt(x, figureBody(a)));
  x += CELL;
  parts.push(marker(x, ":"));
  x += sep;
  parts.push(cellAt(x, figureBody(b)));
  x += CELL + gap;
  parts.push(marker(x - gap, "::"));
  x += sep;
  parts.push(cellAt(x, figureBody(c)));
  x += CELL;
  parts.push(marker(x, ":"));
  x += sep;
  parts.push(cellAt(x, questionMark(0, 0)));

  return svgWrapper(width, CELL, parts.join(""), label);
}

/** A row of candidate figures labelled A, B, C… — used by odd-one-out and classification. */
export function renderCandidateRow(figures: readonly Figure[], label: string): string {
  const gap = 10;
  const labelHeight = 22;
  const width = CELL * figures.length + gap * (figures.length - 1);

  const body = figures
    .map((figure, index) => {
      const x = index * (CELL + gap);
      const letter = String.fromCharCode(65 + index);
      return (
        `<g transform="translate(${n(x)} 0)">${cellFrame(0, 0)}${figureBody(figure)}` +
        `<text x="${n(CELL / 2)}" y="${n(CELL + labelHeight - 6)}" text-anchor="middle" ` +
        `font-size="17" font-weight="600" fill="currentColor" opacity="0.8" ` +
        `font-family="ui-sans-serif, system-ui, sans-serif">${letter}</text></g>`
      );
    })
    .join("");

  return svgWrapper(width, CELL + labelHeight, body, label);
}

/** Human-readable description of a figure, used for stems, alt text and explanations. */
export function describeFigure(figure: Figure): string {
  const fillWord: Record<Fill, string> = {
    none: "outlined",
    solid: "solid",
    hatch: "hatched",
    dots: "dotted",
    half: "half-filled",
  };
  const plural = figure.count > 1 ? "s" : "";
  const rotationPart = figure.rotation === 0 ? "" : ` rotated ${figure.rotation}°`;
  return `${figure.count} ${figure.size} ${fillWord[figure.fill]} ${figure.shape}${plural}${rotationPart}`;
}
