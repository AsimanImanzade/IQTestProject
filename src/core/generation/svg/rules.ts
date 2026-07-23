/**
 * Transformation rules over the figural attribute space.
 *
 * A rule fixes one attribute to a small ordered sub-domain and advances an index as you move
 * across a row (`rowStep`) or down a column (`colStep`):
 *
 *     valueIndex(row, col) = baseIndex + col * rowStep + row * colStep   (mod values.length)
 *
 * This single formulation covers everything the figural generators need:
 *   * a 1-D sequence is the row `row = 0`
 *   * a Raven-style matrix uses both steps
 *   * "distribution of three" (each row and column contains each of three values exactly once)
 *     falls out automatically from a 3-value sub-domain with non-zero, coprime steps — no special
 *     case required
 *
 * Because rules are pure index arithmetic they commute, so the missing cell of a matrix is
 * computed directly rather than by replaying transformations. That is what lets every generator
 * *derive* its answer instead of asserting one.
 */

import type { Attribute, Count, Figure, Fill, Rotation, Shape, Size } from "./figure";
import { ATTRIBUTE_DOMAINS, ROTATABLE_SHAPES, SHAPES } from "./figure";
import type { Rng } from "../../types";

export type AttributeValue = Shape | Fill | Size | Rotation | Count;

export interface FigureRule {
  attribute: Attribute;
  /** Ordered sub-domain this rule cycles through. Length 3 for matrices, 2-4 for sequences. */
  values: readonly AttributeValue[];
  baseIndex: number;
  /** Index shift per step to the right. */
  rowStep: number;
  /** Index shift per step downward. Zero for 1-D sequences. */
  colStep: number;
}

/** Resolve the attribute value a rule dictates at a given grid position. */
export function valueAt(rule: FigureRule, row: number, col: number): AttributeValue {
  const size = rule.values.length;
  const raw = rule.baseIndex + col * rule.rowStep + row * rule.colStep;
  const index = ((raw % size) + size) % size;
  const value = rule.values[index];
  if (value === undefined) throw new Error(`Rule for ${rule.attribute} has an empty domain`);
  return value;
}

/** Build the figure at a grid position by applying every rule to the base figure. */
export function figureAt(
  base: Figure,
  rules: readonly FigureRule[],
  row: number,
  col: number,
): Figure {
  const result: Figure = { ...base };
  for (const rule of rules) {
    // Each rule owns exactly one attribute (enforced by the rule builders below), so these
    // assignments never conflict.
    switch (rule.attribute) {
      case "shape":
        result.shape = valueAt(rule, row, col) as Shape;
        break;
      case "fill":
        result.fill = valueAt(rule, row, col) as Fill;
        break;
      case "size":
        result.size = valueAt(rule, row, col) as Size;
        break;
      case "rotation":
        result.rotation = valueAt(rule, row, col) as Rotation;
        break;
      case "count":
        result.count = valueAt(rule, row, col) as Count;
        break;
      default: {
        const exhaustive: never = rule.attribute;
        throw new Error(`Unhandled attribute: ${String(exhaustive)}`);
      }
    }
  }
  return result;
}

/** Plain-language description of a rule, used to build the explanation shown after the test. */
export function describeRule(rule: FigureRule, twoDimensional: boolean): string {
  const name = ATTRIBUTE_LABEL[rule.attribute];
  const across =
    rule.rowStep === 0
      ? `${name} stays the same across each row`
      : `${name} advances through ${formatValues(rule.values)} from left to right`;

  if (!twoDimensional) return across;

  const down =
    rule.colStep === 0
      ? `is constant down each column`
      : `and shifts again from top to bottom`;
  return `${across}, ${down}`;
}

const ATTRIBUTE_LABEL: Record<Attribute, string> = {
  shape: "the shape",
  fill: "the fill style",
  size: "the size",
  rotation: "the orientation",
  count: "the number of elements",
};

function formatValues(values: readonly AttributeValue[]): string {
  return values.map((v) => (typeof v === "number" ? `${v}` : v)).join(" → ");
}

// ---------------------------------------------------------------------------
// Rule construction
// ---------------------------------------------------------------------------

/**
 * Pick `count` consecutive-but-shuffled values from an attribute's domain.
 *
 * Rotation is special-cased: a rotation rule is only meaningful if the chosen shape actually
 * *shows* its orientation. Circles are rotationally symmetric and hexagons absorb 45-degree
 * steps, so applying a rotation rule to them yields cells that look identical — an unanswerable
 * item. Callers guard against this by restricting the shape domain (see `pickShapeDomain`).
 */
function pickValues(rng: Rng, attribute: Attribute, count: number): AttributeValue[] {
  const domain = ATTRIBUTE_DOMAINS[attribute] as readonly AttributeValue[];
  if (count > domain.length) {
    throw new Error(`Cannot draw ${count} values from ${attribute} (domain ${domain.length})`);
  }

  if (attribute === "rotation") {
    // Use evenly spaced rotations so the progression reads as a rotation rather than as noise.
    const step = rng.pick([1, 2] as const); // 45° or 90° increments
    const start = rng.int(0, domain.length - 1);
    const picked: AttributeValue[] = [];
    for (let i = 0; i < count; i += 1) {
      const value = domain[(start + i * step) % domain.length];
      if (value === undefined) throw new Error("rotation domain underflow");
      picked.push(value);
    }
    return picked;
  }

  if (attribute === "count" || attribute === "size") {
    // Ordered progressions (1→2→3, small→medium→large) read as a rule; shuffled ones read as
    // arbitrary. Keep these monotonic.
    const maxStart = domain.length - count;
    const start = rng.int(0, Math.max(0, maxStart));
    const slice = domain.slice(start, start + count);
    return rng.chance(0.5) ? [...slice] : [...slice].reverse();
  }

  return rng.sample(domain, count);
}

/** Shapes safe to use when a rotation rule is present. */
export function pickShapeDomain(rng: Rng, count: number, rotationInUse: boolean): Shape[] {
  const pool = rotationInUse ? ROTATABLE_SHAPES : SHAPES;
  return rng.sample(pool, count);
}

export interface BuildRulesOptions {
  /** Number of attributes that vary. 1 = easy, 2 = medium, 3 = hard. */
  attributeCount: number;
  /** Length of each attribute's sub-domain (3 for a 3x3 matrix). */
  domainSize: number;
  /** Whether rules also advance down columns. */
  twoDimensional: boolean;
}

/**
 * Build a consistent rule set plus the base figure it applies to.
 *
 * Returns null when the sampled combination cannot produce a well-formed item — for example a
 * rotation rule landing on a shape whose symmetry hides it. Callers simply retry with a new seed.
 */
export function buildRuleSet(
  rng: Rng,
  options: BuildRulesOptions,
): { base: Figure; rules: FigureRule[] } | null {
  const { attributeCount, domainSize, twoDimensional } = options;

  const candidates: Attribute[] = ["shape", "fill", "size", "rotation", "count"];
  const chosen = rng.sample(candidates, attributeCount);
  const rotationInUse = chosen.includes("rotation");

  // `size` and `count` domains are short (3 and 4), so they cannot supply larger sub-domains.
  for (const attribute of chosen) {
    if (ATTRIBUTE_DOMAINS[attribute].length < domainSize) return null;
  }

  const rules: FigureRule[] = [];
  for (const attribute of chosen) {
    const values =
      attribute === "shape"
        ? pickShapeDomain(rng, domainSize, rotationInUse)
        : pickValues(rng, attribute, domainSize);

    if (values.length !== domainSize) return null;

    // Steps must be non-zero and coprime with the domain size, otherwise the progression
    // revisits values within a single row and the rule stops being recoverable.
    const stepPool = coprimeSteps(domainSize);
    const rowStep = rng.pick(stepPool);
    const colStep = twoDimensional ? rng.pick(stepPool) : 0;

    rules.push({
      attribute,
      values,
      baseIndex: rng.int(0, domainSize - 1),
      rowStep,
      colStep,
    });
  }

  // The base figure supplies values for every attribute NOT governed by a rule; those stay fixed
  // across the whole grid, which is what makes the varying attributes stand out.
  const governed = new Set(rules.map((r) => r.attribute));
  const base: Figure = {
    shape: governed.has("shape")
      ? "circle"
      : rng.pick(rotationInUse ? ROTATABLE_SHAPES : SHAPES),
    fill: governed.has("fill") ? "none" : rng.pick(ATTRIBUTE_DOMAINS.fill),
    size: governed.has("size") ? "medium" : rng.pick(ATTRIBUTE_DOMAINS.size),
    rotation: governed.has("rotation") ? 0 : 0,
    count: governed.has("count") ? 1 : rng.pick(ATTRIBUTE_DOMAINS.count),
  };

  // A rotation rule over a shape that hides rotation produces identical-looking cells.
  if (rotationInUse && !governed.has("shape")) {
    if (base.shape === "circle" || base.shape === "hexagon") return null;
  }

  return { base, rules };
}

/** Steps in 1..size-1 that are coprime with `size`, so a full cycle visits every value. */
function coprimeSteps(size: number): number[] {
  const steps: number[] = [];
  for (let s = 1; s < size; s += 1) {
    if (gcd(s, size) === 1) steps.push(s);
  }
  return steps.length > 0 ? steps : [1];
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}
