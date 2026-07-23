/**
 * Localized vocabulary and descriptions for figural items.
 *
 * This is the single source of truth for how a figure and a rule are described in words, in every
 * language. The generators import the `*L` builders here to produce localized stems, explanations
 * and rationales.
 *
 * AZERBAIJANI GRAMMAR NOTES (for the native reviewer):
 *   * Nouns are not pluralised after a number: "2 dairə", never "2 dairələr".
 *   * Adjective order is number → size → fill → shape: "2 kiçik dolu üçbucaq".
 *   * Rotation is expressed as a trailing participle clause "(90° fırlanmış)" to avoid a long
 *     pre-nominal pile-up.
 */

import type { Locale, LocalizedString } from "../../i18n";
import { buildLocalized } from "../i18n-helpers";
import type { Attribute } from "./figure";
import type { Fill, Figure, Shape, Size } from "./figure";
import type { FigureRule, AttributeValue } from "./rules";

// ---------------------------------------------------------------------------
// Word tables
// ---------------------------------------------------------------------------

const SHAPE_WORDS: Record<Locale, Record<Shape, string>> = {
  en: {
    circle: "circle", square: "square", triangle: "triangle", diamond: "diamond",
    pentagon: "pentagon", hexagon: "hexagon", star: "star", cross: "cross",
  },
  az: {
    circle: "dairə", square: "kvadrat", triangle: "üçbucaq", diamond: "romb",
    pentagon: "beşbucaq", hexagon: "altıbucaq", star: "ulduz", cross: "xaç",
  },
};

const FILL_WORDS: Record<Locale, Record<Fill, string>> = {
  en: { none: "outlined", solid: "solid", hatch: "hatched", dots: "dotted", half: "half-filled" },
  az: { none: "konturlu", solid: "dolu", hatch: "ştrixli", dots: "nöqtəli", half: "yarıdolu" },
};

const SIZE_WORDS: Record<Locale, Record<Size, string>> = {
  en: { small: "small", medium: "medium", large: "large" },
  az: { small: "kiçik", medium: "orta", large: "böyük" },
};

/** "the shape" / "the fill style" … as used inside rule and error descriptions. */
const ATTRIBUTE_WORDS: Record<Locale, Record<Attribute, string>> = {
  en: {
    shape: "the shape",
    fill: "the fill style",
    size: "the size",
    rotation: "the orientation",
    count: "the number of elements",
  },
  az: {
    shape: "forma",
    fill: "doldurma stili",
    size: "ölçü",
    rotation: "istiqamət",
    count: "elementlərin sayı",
  },
};

export function shapeWord(shape: Shape, locale: Locale): string {
  return SHAPE_WORDS[locale][shape];
}

export function attributeWord(attribute: Attribute, locale: Locale): string {
  return ATTRIBUTE_WORDS[locale][attribute];
}

// ---------------------------------------------------------------------------
// Figure description
// ---------------------------------------------------------------------------

function describeFigureIn(figure: Figure, locale: Locale): string {
  const size = SIZE_WORDS[locale][figure.size];
  const fill = FILL_WORDS[locale][figure.fill];
  const shape = SHAPE_WORDS[locale][figure.shape];

  if (locale === "az") {
    const rotation = figure.rotation === 0 ? "" : ` (${figure.rotation}° fırlanmış)`;
    return `${figure.count} ${size} ${fill} ${shape}${rotation}`;
  }

  // English pluralises the shape noun.
  const plural = figure.count > 1 ? "s" : "";
  const rotation = figure.rotation === 0 ? "" : ` rotated ${figure.rotation}°`;
  return `${figure.count} ${size} ${fill} ${shape}${plural}${rotation}`;
}

/** Localized human description of a figure — used in stems, explanations and alt text. */
export function describeFigureL(figure: Figure): LocalizedString {
  return buildLocalized((locale) => describeFigureIn(figure, locale));
}

/** Per-locale figure description, for use inside a `buildLocalized` callback. */
export function describeFigureAt(figure: Figure, locale: Locale): string {
  return describeFigureIn(figure, locale);
}

/** Per-locale rule-set description, for use inside a `buildLocalized` callback. */
export function describeRulesAt(
  rules: readonly FigureRule[],
  twoDimensional: boolean,
  locale: Locale,
): string {
  return rules.map((rule) => describeRuleIn(rule, twoDimensional, locale)).join("; ");
}

/** Plain English description (kept for the signature hash and SVG alt text). */
export function describeFigureEn(figure: Figure): string {
  return describeFigureIn(figure, "en");
}

// ---------------------------------------------------------------------------
// Attribute values (used by odd-one-out / classification explanations)
// ---------------------------------------------------------------------------

export function describeAttributeValue(
  attribute: Attribute,
  value: unknown,
  locale: Locale,
): string {
  const az = locale === "az";
  switch (attribute) {
    case "count":
      return az ? `${String(value)} element` : `${String(value)} element${value === 1 ? "" : "s"}`;
    case "rotation":
      return az ? `${String(value)}° istiqamət` : `an orientation of ${String(value)}°`;
    case "size":
      return az ? `${SIZE_WORDS.az[value as Size]} ölçü` : `a ${String(value)} size`;
    case "fill":
      return az ? `${FILL_WORDS.az[value as Fill]} doldurma` : `a ${String(value)} fill`;
    case "shape":
      return az ? `${SHAPE_WORDS.az[value as Shape]} forma` : `the ${String(value)} shape`;
    default:
      return String(value);
  }
}

// ---------------------------------------------------------------------------
// Rule description
// ---------------------------------------------------------------------------

function formatValues(values: readonly AttributeValue[], locale: Locale): string {
  return values
    .map((v) => {
      if (typeof v === "number") return `${v}`;
      // Shape values render as words; other string values (fills/sizes) stay as their key, which
      // only appears inside the detailed rule text.
      if ((SHAPE_WORDS[locale] as Record<string, string>)[v as string]) {
        return SHAPE_WORDS[locale][v as Shape];
      }
      return String(v);
    })
    .join(" → ");
}

function describeRuleIn(rule: FigureRule, twoDimensional: boolean, locale: Locale): string {
  const name = ATTRIBUTE_WORDS[locale][rule.attribute];

  if (locale === "az") {
    const across =
      rule.rowStep === 0
        ? `hər sırada ${name} dəyişmir`
        : `${name} soldan sağa ${formatValues(rule.values, locale)} ardıcıllığı ilə dəyişir`;
    if (!twoDimensional) return across;
    const down = rule.colStep === 0 ? `hər sütunda sabit qalır` : `yuxarıdan aşağıya da dəyişir`;
    return `${across}, ${down}`;
  }

  const across =
    rule.rowStep === 0
      ? `${name} stays the same across each row`
      : `${name} advances through ${formatValues(rule.values, locale)} from left to right`;
  if (!twoDimensional) return across;
  const down = rule.colStep === 0 ? `is constant down each column` : `and shifts again from top to bottom`;
  return `${across}, ${down}`;
}

/** Build a localized description of one or more rules, joined. */
export function describeRulesL(rules: readonly FigureRule[], twoDimensional: boolean): LocalizedString {
  return buildLocalized((locale) =>
    rules.map((rule) => describeRuleIn(rule, twoDimensional, locale)).join("; "),
  );
}
