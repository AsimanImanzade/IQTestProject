/**
 * The figural attribute space.
 *
 * A "figure" is a vector of independent, discrete attributes. Six of the twelve question
 * categories (matrix reasoning, pattern recognition, visual sequences, figural analogies,
 * classification, odd one out) are the *same* engine over this space with different rule sets —
 * that consolidation is what keeps the generator count at six instead of twelve.
 *
 * ACCESSIBILITY: colour is deliberately NOT an attribute. Every figure renders in `currentColor`,
 * so figures inherit the theme and remain legible in light and dark mode, and no item can ever
 * be solvable only by distinguishing hues. Texture (fill style) carries that load instead, which
 * is safe for colour-blind test takers — important for a reasoning test that must be fair.
 */

export const SHAPES = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "pentagon",
  "hexagon",
  "star",
  "cross",
] as const;
export type Shape = (typeof SHAPES)[number];

export const FILLS = ["none", "solid", "hatch", "dots", "half"] as const;
export type Fill = (typeof FILLS)[number];

export const SIZES = ["small", "medium", "large"] as const;
export type Size = (typeof SIZES)[number];

export const ROTATIONS = [0, 45, 90, 135, 180, 225, 270, 315] as const;
export type Rotation = (typeof ROTATIONS)[number];

export const COUNTS = [1, 2, 3, 4] as const;
export type Count = (typeof COUNTS)[number];

export interface Figure {
  shape: Shape;
  fill: Fill;
  size: Size;
  rotation: Rotation;
  count: Count;
}

/** The attribute names a rule may operate on. */
export const ATTRIBUTES = ["shape", "fill", "size", "rotation", "count"] as const;
export type Attribute = (typeof ATTRIBUTES)[number];

/** Ordered domain of each attribute, used by cyclic progression rules. */
export const ATTRIBUTE_DOMAINS = {
  shape: SHAPES,
  fill: FILLS,
  size: SIZES,
  rotation: ROTATIONS,
  count: COUNTS,
} as const satisfies Record<Attribute, readonly (string | number)[]>;

export function domainSize(attribute: Attribute): number {
  return ATTRIBUTE_DOMAINS[attribute].length;
}

/** Index of a figure's current value within its attribute domain. */
export function attributeIndex(figure: Figure, attribute: Attribute): number {
  const domain = ATTRIBUTE_DOMAINS[attribute] as readonly (string | number)[];
  const index = domain.indexOf(figure[attribute]);
  if (index < 0) {
    throw new Error(`Figure has value outside the ${attribute} domain: ${String(figure[attribute])}`);
  }
  return index;
}

/** Produce a copy of `figure` with `attribute` set to the domain value at `index` (wrapping). */
export function withAttributeIndex(
  figure: Figure,
  attribute: Attribute,
  index: number,
): Figure {
  const domain = ATTRIBUTE_DOMAINS[attribute] as readonly (string | number)[];
  const size = domain.length;
  // JS % keeps the sign of the dividend, so negative offsets need the extra wrap.
  const wrapped = ((index % size) + size) % size;
  const value = domain[wrapped];
  if (value === undefined) throw new Error(`Empty domain for attribute ${attribute}`);
  return { ...figure, [attribute]: value } as Figure;
}

export function figuresEqual(a: Figure, b: Figure): boolean {
  return (
    a.shape === b.shape &&
    a.fill === b.fill &&
    a.size === b.size &&
    a.rotation === b.rotation &&
    a.count === b.count
  );
}

/** Stable, compact string form — used for dedupe signatures and distractor-uniqueness checks. */
export function figureKey(figure: Figure): string {
  return `${figure.shape}|${figure.fill}|${figure.size}|${figure.rotation}|${figure.count}`;
}

/**
 * Number of attributes on which two figures differ. Distractor quality depends on this:
 * a distractor differing on exactly one attribute is genuinely tempting, whereas one differing
 * on four is trivially rejected and carries no psychometric information.
 */
export function figureDistance(a: Figure, b: Figure): number {
  let d = 0;
  for (const attribute of ATTRIBUTES) {
    if (a[attribute] !== b[attribute]) d += 1;
  }
  return d;
}

/**
 * Rotational symmetry order of each shape. A rotation rule applied to a shape whose symmetry
 * absorbs it produces a figure that looks identical to the original — which would silently
 * create an unanswerable item. Generators consult this before using `rotation` as a rule
 * attribute.
 */
const SYMMETRY_ORDER: Record<Shape, number> = {
  circle: 360, // fully symmetric: rotation is never visible
  square: 4,
  triangle: 3,
  diamond: 2,
  pentagon: 5,
  hexagon: 6,
  star: 5,
  cross: 4,
};

/** True when rotating `shape` by `degrees` produces a visually distinguishable figure. */
export function rotationIsVisible(shape: Shape, degrees: number): boolean {
  if (shape === "circle") return false;
  const order = SYMMETRY_ORDER[shape];
  const period = 360 / order;
  const normalised = ((degrees % 360) + 360) % 360;
  return normalised % period !== 0;
}

/** Shapes whose orientation is visible at 45-degree steps — safe for rotation-based rules. */
export const ROTATABLE_SHAPES: readonly Shape[] = SHAPES.filter(
  (s) => s !== "circle" && s !== "hexagon",
);
