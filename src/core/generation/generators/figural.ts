/**
 * Figural generators — six of the twelve categories, all driven by the shared attribute space.
 *
 *   matrix-reasoning     3x3 Raven-style grid, rules run across rows AND down columns
 *   pattern-recognition  1-D repeating transformation cycle
 *   visual-sequences     1-D monotonic progression (count/size grow, orientation turns)
 *   analogies (figural)  A : B :: C : ?  — transfer a single transformation
 *   classification       which candidate belongs to the class the examples define
 *   odd-one-out          which candidate breaks the property the others share
 *
 * Every answer is *computed* from the rule set, never authored, so correctness is structural.
 */

import type {
  Difficulty,
  GeneratedItem,
  QuestionGenerator,
  Rng,
} from "../../types";
import { buildChoices, estimateSeconds, optionCountFor } from "../choices";
import type { DistractorCandidate } from "../choices";
import { buildSignature } from "../signature";
import { L, type LocalizedString } from "../../i18n";
import { buildLocalized } from "../i18n-helpers";
import type { Attribute, Figure } from "../svg/figure";
import {
  ATTRIBUTE_DOMAINS,
  ATTRIBUTES,
  figureKey,
  figuresEqual,
  ROTATABLE_SHAPES,
  SHAPES,
} from "../svg/figure";
import { figureAt, type FigureRule } from "../svg/rules";
import { buildRuleSet } from "../svg/rules";
import {
  renderAnalogy,
  renderCandidateRow,
  renderFigure,
  renderMatrix,
  renderSequence,
} from "../svg/render";
import {
  attributeWord,
  describeAttributeValue,
  describeFigureAt,
  describeRulesAt,
} from "../svg/describe-i18n";

const renderChoice = (figure: Figure) => ({ svg: renderFigure(figure, describeFigureAt(figure, "en")) });

/** Perturb exactly one attribute of a figure — the "close but wrong" distractor family. */
function perturbOne(rng: Rng, figure: Figure, attribute?: Attribute): Figure {
  const target = attribute ?? rng.pick(ATTRIBUTES);
  const domain = ATTRIBUTE_DOMAINS[target] as readonly unknown[];
  const current = figure[target];
  const alternatives = domain.filter((v) => v !== current);
  if (alternatives.length === 0) return figure;
  const replacement = rng.pick(alternatives);
  return { ...figure, [target]: replacement } as Figure;
}

/** Configuration derived from the requested difficulty. */
function matrixConfig(difficulty: Difficulty): {
  attributeCount: number;
  twoDimensional: boolean;
} {
  if (difficulty <= 2) return { attributeCount: 1, twoDimensional: false };
  if (difficulty <= 4) return { attributeCount: 1, twoDimensional: true };
  if (difficulty <= 6) return { attributeCount: 2, twoDimensional: true };
  if (difficulty <= 8) return { attributeCount: 2, twoDimensional: true };
  return { attributeCount: 3, twoDimensional: true };
}

// ---------------------------------------------------------------------------
// Matrix reasoning
// ---------------------------------------------------------------------------

const matrixGenerator: QuestionGenerator = {
  id: "figural.matrix",
  category: "matrix-reasoning",
  supportedDifficulties: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    const config = matrixConfig(difficulty);
    const built = buildRuleSet(rng, {
      attributeCount: config.attributeCount,
      domainSize: 3,
      twoDimensional: config.twoDimensional,
    });
    if (!built) return null;

    const { base, rules } = built;

    // Build all nine cells; the ninth (bottom-right) is the answer.
    const cells: Figure[] = [];
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        cells.push(figureAt(base, rules, row, col));
      }
    }
    const answer = cells[8];
    if (!answer) return null;

    // Reject degenerate grids: if the eight visible cells contain fewer than three distinct
    // figures the rule is not observable, and if the answer already appears elsewhere the item
    // is ambiguous.
    const visible = cells.slice(0, 8);
    const distinctVisible = new Set(visible.map(figureKey));
    if (distinctVisible.size < 3) return null;

    const displayed: (Figure | null)[] = [...visible, null];

    // Distractors, ordered by psychometric value.
    const candidates: DistractorCandidate<Figure>[] = [
      {
        value: figureAt(base, rules, 0, 2),
        rationale: L(
          "Follows the rule across the row but ignores how it also changes down the column.",
          "Qaydanı sıra boyunca izləyir, lakin onun sütun boyunca da dəyişməsini nəzərə almır.",
        ),
      },
      {
        value: figureAt(base, rules, 2, 0),
        rationale: L(
          "Follows the rule down the column but ignores how it changes across the row.",
          "Qaydanı sütun boyunca izləyir, lakin onun sıra boyunca dəyişməsini nəzərə almır.",
        ),
      },
      {
        value: figureAt(base, rules, 1, 2),
        rationale: L(
          "Continues from the wrong row — one row short of the bottom.",
          "Yanlış sıradan davam edir — aşağıya bir sıra çatmır.",
        ),
      },
      {
        value: figureAt(base, rules, 2, 1),
        rationale: L(
          "Continues from the wrong column — one column short of the right-hand edge.",
          "Yanlış sütundan davam edir — sağ kənara bir sütun çatmır.",
        ),
      },
      ...rules.map((rule) => ({
        value: perturbOne(rng, answer, rule.attribute),
        rationale: buildLocalized((l) =>
          l === "az"
            ? `${attributeWord(rule.attribute, "az")} istisna olmaqla düzgündür — o, dəyişmədən saxlanılıb.`
            : `Correct except for ${attributeWord(rule.attribute, "en")}, which was carried over unchanged.`,
        ),
      })),
      {
        value: visible[7] ?? answer,
        rationale: L(
          "Repeats the cell immediately to the left instead of applying the rule.",
          "Qaydanı tətbiq etmək əvəzinə dərhal solundakı xananı təkrarlayır.",
        ),
      },
    ];

    const choices = buildChoices({
      rng,
      correct: answer,
      correctRationale: L(
        "Applies every rule in both directions.",
        "Bütün qaydaları hər iki istiqamətdə tətbiq edir.",
      ),
      candidates,
      optionCount: optionCountFor(difficulty),
      keyOf: figureKey,
      render: renderChoice,
      fallback: () => ({
        value: perturbOne(rng, answer),
        rationale: L(
          "Differs from the correct figure on one attribute.",
          "Düzgün fiqurdan bir xüsusiyyətlə fərqlənir.",
        ),
      }),
    });
    if (!choices) return null;

    return {
      category: "matrix-reasoning",
      difficulty,
      stem: L("Which figure completes the matrix?", "Hansı fiqur matrisi tamamlayır?"),
      svg: renderMatrix(displayed, "Three by three matrix of figures with the bottom-right cell missing"),
      choices,
      explanation: buildLocalized((l) => {
        const rt = capitalise(describeRulesAt(rules, config.twoDimensional, l));
        return l === "az"
          ? `${rt}. Bütün qaydaları aşağı-sağ mövqeyə tətbiq etsək ${describeFigureAt(answer, "az")} alınır.`
          : `${rt}. Applying every rule to the bottom-right position gives ${describeFigureAt(answer, "en")}.`;
      }),
      estimatedSeconds: estimateSeconds(difficulty, 30),
      generatorId: matrixGenerator.id,
      seed: "",
      signature: buildSignature("matrix-reasoning", cells.map(figureKey).join(";")),
    };
  },
};

// ---------------------------------------------------------------------------
// Pattern recognition (repeating cycle) and visual sequences (progression)
// ---------------------------------------------------------------------------

function sequenceGenerator(
  id: string,
  category: "pattern-recognition" | "visual-sequences",
  stem: LocalizedString,
): QuestionGenerator {
  return {
    id,
    category,
    supportedDifficulties: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],

    generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
      const attributeCount = difficulty <= 3 ? 1 : difficulty <= 7 ? 2 : 3;
      // A longer visible run makes a cycle easier to spot, so shorter runs are harder.
      const length = difficulty <= 4 ? 5 : 4;
      const domainSize = category === "visual-sequences" ? 3 : rng.pick([2, 3, 4] as const);

      const built = buildRuleSet(rng, {
        attributeCount,
        domainSize,
        twoDimensional: false,
      });
      if (!built) return null;
      const { base, rules } = built;

      const shown: Figure[] = [];
      for (let i = 0; i < length; i += 1) shown.push(figureAt(base, rules, 0, i));
      const answer = figureAt(base, rules, 0, length);

      // The rule must actually be visible in the shown run.
      if (new Set(shown.map(figureKey)).size < 2) return null;

      const candidates: DistractorCandidate<Figure>[] = [
        {
          value: figureAt(base, rules, 0, length + 1),
          rationale: L(
            "Skips a step — this is the figure two positions further on.",
            "Bir addım ötürür — bu, iki mövqe irəlidəki fiqurdur.",
          ),
        },
        {
          value: figureAt(base, rules, 0, length - 1),
          rationale: L(
            "Repeats the final visible figure instead of advancing.",
            "İrəliləmək əvəzinə sonuncu görünən fiquru təkrarlayır.",
          ),
        },
        {
          value: figureAt(base, rules, 0, length - 2),
          rationale: L(
            "Steps backwards through the sequence rather than forwards.",
            "Ardıcıllıqda irəli yox, geri addımlayır.",
          ),
        },
        ...rules.map((rule) => ({
          value: perturbOne(rng, answer, rule.attribute),
          rationale: buildLocalized((l) =>
            l === "az"
              ? `${attributeWord(rule.attribute, "az")} istisna olmaqla bütün xüsusiyyətləri irəlilədir.`
              : `Advances every attribute except ${attributeWord(rule.attribute, "en")}.`,
          ),
        })),
      ];

      const choices = buildChoices({
        rng,
        correct: answer,
        correctRationale: L(
          "Advances every attribute by exactly one step.",
          "Hər xüsusiyyəti düz bir addım irəlilədir.",
        ),
        candidates,
        optionCount: optionCountFor(difficulty),
        keyOf: figureKey,
        render: renderChoice,
        fallback: () => ({
          value: perturbOne(rng, answer),
          rationale: L(
            "Differs from the correct continuation on one attribute.",
            "Düzgün davamdan bir xüsusiyyətlə fərqlənir.",
          ),
        }),
      });
      if (!choices) return null;

      return {
        category,
        difficulty,
        stem,
        svg: renderSequence(shown, "Sequence of figures ending with a missing element"),
        choices,
        explanation: buildLocalized((l) => {
          const rt = capitalise(describeRulesAt(rules, false, l));
          return l === "az"
            ? `${rt}. Deməli, növbəti fiqur ${describeFigureAt(answer, "az")}.`
            : `${rt}. The next figure is therefore ${describeFigureAt(answer, "en")}.`;
        }),
        estimatedSeconds: estimateSeconds(difficulty, 22),
        generatorId: id,
        seed: "",
        signature: buildSignature(category, shown.map(figureKey).join(";"), figureKey(answer)),
      };
    },
  };
}

const patternGenerator = sequenceGenerator(
  "figural.pattern",
  "pattern-recognition",
  L("Which figure continues the pattern?", "Hansı fiqur naxışı davam etdirir?"),
);

const visualSequenceGenerator = sequenceGenerator(
  "figural.sequence",
  "visual-sequences",
  L("Which figure comes next in the sequence?", "Ardıcıllıqda növbəti fiqur hansıdır?"),
);

// ---------------------------------------------------------------------------
// Figural analogies
// ---------------------------------------------------------------------------

const figuralAnalogyGenerator: QuestionGenerator = {
  id: "figural.analogy",
  category: "analogies",
  supportedDifficulties: [2, 3, 4, 5, 6, 7, 8, 9],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    const attributeCount = difficulty <= 4 ? 1 : difficulty <= 7 ? 2 : 3;
    const built = buildRuleSet(rng, {
      attributeCount,
      domainSize: 3,
      twoDimensional: false,
    });
    if (!built) return null;
    const { base, rules } = built;

    // A is the base; B applies the transformation once. C is a different starting point and
    // D must apply the *same* transformation.
    const a = figureAt(base, rules, 0, 0);
    const b = figureAt(base, rules, 0, 1);

    // Shift C away from A so the analogy cannot be solved by simply copying B.
    const cBase: Figure = { ...base };
    const shifted = shiftUngoverned(rng, cBase, rules);
    if (!shifted) return null;
    const c = figureAt(shifted, rules, 0, 0);
    const d = figureAt(shifted, rules, 0, 1);

    if (figuresEqual(a, c) || figuresEqual(b, d)) return null;
    if (figuresEqual(c, d)) return null;

    const candidates: DistractorCandidate<Figure>[] = [
      {
        value: b,
        rationale: L(
          "Copies the second figure of the first pair instead of transforming C.",
          "C-ni çevirmək əvəzinə birinci cütün ikinci fiqurunu köçürür.",
        ),
      },
      {
        value: c,
        rationale: L(
          "Leaves C unchanged — no transformation applied.",
          "C-ni dəyişmədən saxlayır — heç bir çevirmə tətbiq olunmayıb.",
        ),
      },
      {
        value: figureAt(shifted, rules, 0, 2),
        rationale: L(
          "Applies the transformation twice rather than once.",
          "Çevirməni bir dəfə yox, iki dəfə tətbiq edir.",
        ),
      },
      {
        value: figureAt(shifted, rules, 0, -1),
        rationale: L(
          "Applies the transformation in the wrong direction.",
          "Çevirməni yanlış istiqamətdə tətbiq edir.",
        ),
      },
      ...rules.map((rule) => ({
        value: perturbOne(rng, d, rule.attribute),
        rationale: buildLocalized((l) =>
          l === "az"
            ? `${attributeWord(rule.attribute, "az")} istisna olmaqla əlaqəni köçürür.`
            : `Transfers the relationship except for ${attributeWord(rule.attribute, "en")}.`,
        ),
      })),
    ];

    const choices = buildChoices({
      rng,
      correct: d,
      correctRationale: L(
        "Applies to C exactly the transformation that turns A into B.",
        "A-nı B-yə çevirən eyni çevirməni C-yə tətbiq edir.",
      ),
      candidates,
      optionCount: optionCountFor(difficulty),
      keyOf: figureKey,
      render: renderChoice,
      fallback: () => ({
        value: perturbOne(rng, d),
        rationale: L(
          "Close to the correct answer but differs on one attribute.",
          "Düzgün cavaba yaxındır, lakin bir xüsusiyyətlə fərqlənir.",
        ),
      }),
    });
    if (!choices) return null;

    return {
      category: "analogies",
      difficulty,
      stem: L(
        "Complete the analogy: the third figure relates to the answer exactly as the first relates to the second.",
        "Analogiyanı tamamlayın: üçüncü fiqur cavaba, birinci fiqurun ikinciyə olan münasibəti kimi bağlıdır.",
      ),
      svg: renderAnalogy(a, b, c, "Figural analogy: A is to B as C is to what"),
      choices,
      explanation: buildLocalized((l) => {
        const rt = lowerFirst(describeRulesAt(rules, false, l));
        return l === "az"
          ? `Birinci fiqurdan ikinciyə keçəndə ${rt}. Eyni dəyişikliyi üçüncü fiqura tətbiq etsək ${describeFigureAt(d, "az")} alınır.`
          : `Going from the first figure to the second, ${rt}. Applying the same change to the third figure gives ${describeFigureAt(d, "en")}.`;
      }),
      estimatedSeconds: estimateSeconds(difficulty, 28),
      generatorId: figuralAnalogyGenerator.id,
      seed: "",
      signature: buildSignature(
        "analogies-figural",
        [a, b, c, d].map(figureKey).join(";"),
      ),
    };
  },
};

/** Move the attributes a rule set does NOT govern, so the second pair starts somewhere new. */
function shiftUngoverned(rng: Rng, figure: Figure, rules: readonly FigureRule[]): Figure | null {
  const governed = new Set(rules.map((r) => r.attribute));
  const free = ATTRIBUTES.filter((a) => !governed.has(a));
  if (free.length === 0) return null;
  const target = rng.pick(free);
  const shifted = perturbOne(rng, figure, target);
  return figuresEqual(shifted, figure) ? null : shifted;
}

// ---------------------------------------------------------------------------
// Odd one out
// ---------------------------------------------------------------------------

/**
 * Odd one out is the category most prone to silently producing ambiguous items: it is very easy
 * to generate a set where a *second* candidate is also uniquely distinguishable on some other
 * attribute, giving two defensible answers. `uniqueOddOneOut` below is the guard, and it runs on
 * every generated set.
 */
function uniqueOddOneOut(figures: readonly Figure[]): number | null {
  const oddIndices: number[] = [];

  for (let i = 0; i < figures.length; i += 1) {
    const candidate = figures[i];
    if (!candidate) return null;
    const others = figures.filter((_, index) => index !== i);

    // `i` is a defensible answer if some attribute is shared by ALL others but differs in `i`.
    const isDefensible = ATTRIBUTES.some((attribute) => {
      const first = others[0];
      if (!first) return false;
      const allShare = others.every((o) => o[attribute] === first[attribute]);
      return allShare && candidate[attribute] !== first[attribute];
    });

    if (isDefensible) oddIndices.push(i);
  }

  return oddIndices.length === 1 ? (oddIndices[0] ?? null) : null;
}

const oddOneOutGenerator: QuestionGenerator = {
  id: "figural.odd-one-out",
  category: "odd-one-out",
  supportedDifficulties: [1, 2, 3, 4, 5, 6, 7, 8],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    const count = difficulty <= 4 ? 4 : 5;
    // Harder items share fewer attributes, so the odd one is less conspicuous.
    //
    // The cap of 3 is load-bearing, not cosmetic: there are five attributes, one of which
    // becomes `differing`. Sharing four would leave the conforming members with nothing free to
    // vary, making them byte-identical figures — which the duplicate check then rejects, so the
    // generator would silently produce nothing at all for those difficulties.
    const sharedCount = difficulty <= 5 ? 3 : 2;

    const shared = rng.sample(ATTRIBUTES, sharedCount);
    const free = ATTRIBUTES.filter((a) => !shared.includes(a));

    // Easy items break an attribute that is obvious at a glance; hard items break a subtle one.
    // This is what difficulty should mean here, rather than how many attributes are shared.
    const obvious: Attribute[] = ["shape", "count", "size"];
    const preferred = free.filter((a) =>
      difficulty <= 4 ? obvious.includes(a) : !obvious.includes(a),
    );
    const differing = rng.pick(preferred.length > 0 ? preferred : free);

    const template: Figure = {
      shape: rng.pick(SHAPES),
      fill: rng.pick(ATTRIBUTE_DOMAINS.fill),
      size: rng.pick(ATTRIBUTE_DOMAINS.size),
      rotation: 0,
      count: rng.pick(ATTRIBUTE_DOMAINS.count),
    };

    // The conforming members share `differing`'s value; the odd one breaks it. Attributes
    // outside `shared` are allowed to vary so the set does not look mechanical.
    const conformingValue = template[differing];
    const members: Figure[] = [];
    for (let i = 0; i < count - 1; i += 1) {
      let member: Figure = { ...template };
      for (const attribute of ATTRIBUTES) {
        if (shared.includes(attribute) || attribute === differing) continue;
        member = perturbOne(rng, member, attribute);
      }
      member = { ...member, [differing]: conformingValue } as Figure;
      members.push(member);
    }

    const oddBase = members[0];
    if (!oddBase) return null;
    const odd = perturbOne(rng, { ...oddBase }, differing);
    if (odd[differing] === conformingValue) return null;

    const all = rng.shuffle([...members, odd]);
    // Duplicate figures would make two options indistinguishable.
    if (new Set(all.map(figureKey)).size !== all.length) return null;

    const answerIndex = uniqueOddOneOut(all);
    if (answerIndex === null) return null;
    const answerFigure = all[answerIndex];
    if (!answerFigure || !figuresEqual(answerFigure, odd)) return null;

    const letters = all.map((_, i) => String.fromCharCode(65 + i));
    const choices = letters.map((letter, index) => ({
      // A/B/C labels are language-neutral, but the choice contract is localized.
      text: L(letter, letter),
      isCorrect: index === answerIndex,
      rationale:
        index === answerIndex
          ? buildLocalized((l) =>
              l === "az"
                ? `Bütün digər fiqurlar ${describeAttributeValue(differing, conformingValue, "az")} paylaşır; bu isə yox.`
                : `Every other figure shares ${describeAttributeValue(differing, conformingValue, "en")}; this one does not.`,
            )
          : buildLocalized((l) =>
              l === "az"
                ? `Bu fiqur ${describeAttributeValue(differing, conformingValue, "az")} əksəriyyətlə paylaşır, ona görə qrupa aiddir.`
                : `This figure shares ${describeAttributeValue(differing, conformingValue, "en")} with the majority, so it belongs to the group.`,
            ),
    }));

    return {
      category: "odd-one-out",
      difficulty,
      stem: L("Which figure does not belong with the others?", "Hansı fiqur digərlərinə aid deyil?"),
      svg: renderCandidateRow(all, "Row of candidate figures labelled A onwards"),
      choices,
      explanation: buildLocalized((l) =>
        l === "az"
          ? `${letters[answerIndex]} istisna olmaqla bütün fiqurlar ${describeAttributeValue(differing, conformingValue, "az")} paylaşır. ${letters[answerIndex]} ${describeFigureAt(answerFigure, "az")}, bu xüsusiyyəti pozur.`
          : `All the figures except ${letters[answerIndex]} share ${describeAttributeValue(differing, conformingValue, "en")}. ${letters[answerIndex]} is ${describeFigureAt(answerFigure, "en")}, breaking that property.`,
      ),
      estimatedSeconds: estimateSeconds(difficulty, 20),
      generatorId: oddOneOutGenerator.id,
      seed: "",
      signature: buildSignature("odd-one-out", all.map(figureKey).join(";")),
    };
  },
};

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

const classificationGenerator: QuestionGenerator = {
  id: "figural.classification",
  category: "classification",
  supportedDifficulties: [2, 3, 4, 5, 6, 7, 8, 9],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    // The class is defined by 1-2 attributes held constant across the examples.
    const definingCount = difficulty <= 4 ? 1 : 2;
    const defining = rng.sample(ATTRIBUTES, definingCount);

    const rotationSafe = defining.includes("rotation");
    const template: Figure = {
      shape: rng.pick(rotationSafe ? ROTATABLE_SHAPES : SHAPES),
      fill: rng.pick(ATTRIBUTE_DOMAINS.fill),
      size: rng.pick(ATTRIBUTE_DOMAINS.size),
      rotation: rotationSafe ? rng.pick(ATTRIBUTE_DOMAINS.rotation) : 0,
      count: rng.pick(ATTRIBUTE_DOMAINS.count),
    };

    // Three examples that agree on the defining attributes and differ elsewhere.
    const examples: Figure[] = [];
    for (let i = 0; i < 3; i += 1) {
      let example: Figure = { ...template };
      for (const attribute of ATTRIBUTES) {
        if (defining.includes(attribute)) continue;
        example = perturbOne(rng, example, attribute);
      }
      examples.push(example);
    }
    if (new Set(examples.map(figureKey)).size !== 3) return null;

    // The correct answer agrees on every defining attribute; each distractor violates one.
    let member: Figure = { ...template };
    for (const attribute of ATTRIBUTES) {
      if (defining.includes(attribute)) continue;
      member = perturbOne(rng, member, attribute);
    }
    if (examples.some((e) => figuresEqual(e, member))) return null;

    const candidates: DistractorCandidate<Figure>[] = defining.map((attribute) => ({
      value: perturbOne(rng, member, attribute),
      rationale: buildLocalized((l) =>
        l === "az"
          ? `${attributeWord(attribute, "az")} baxımından fərqlənir, halbuki hər nümunə bunu sabit saxlayır.`
          : `Differs on ${attributeWord(attribute, "en")}, which every example holds constant.`,
      ),
    }));

    // Top up with figures violating a defining attribute in a different way.
    for (const attribute of defining) {
      candidates.push({
        value: perturbOne(rng, { ...member }, attribute),
        rationale: buildLocalized((l) =>
          l === "az"
            ? `Qrupun ${attributeWord(attribute, "az")} xüsusiyyətinə uyğun gəlmir.`
            : `Does not match the group's ${attributeWord(attribute, "en")}.`,
        ),
      });
    }

    const choices = buildChoices({
      rng,
      correct: member,
      correctRationale: buildLocalized((l) =>
        l === "az"
          ? `Qrupla ${defining.map((a) => attributeWord(a, "az")).join(" və ")} baxımından uyğun gəlir.`
          : `Matches the group on ${defining.map((a) => attributeWord(a, "en")).join(" and ")}.`,
      ),
      candidates,
      optionCount: optionCountFor(difficulty),
      keyOf: figureKey,
      render: renderChoice,
      fallback: () => {
        const attribute = rng.pick(defining);
        return {
          value: perturbOne(rng, member, attribute),
          rationale: buildLocalized((l) =>
            l === "az"
              ? `Qrupun ${attributeWord(attribute, "az")} xüsusiyyətini pozur.`
              : `Violates the group's ${attributeWord(attribute, "en")}.`,
          ),
        };
      },
    });
    if (!choices) return null;

    return {
      category: "classification",
      difficulty,
      stem: L(
        "The three figures on the left form a group. Which option belongs to the same group?",
        "Soldakı üç fiqur bir qrup təşkil edir. Hansı variant eyni qrupa aiddir?",
      ),
      svg: renderCandidateRow(examples, "Three example figures defining a group"),
      choices,
      explanation: buildLocalized((l) => {
        const definingText = defining
          .map((attribute) => describeAttributeValue(attribute, template[attribute], l))
          .join(l === "az" ? " və " : " and ");
        const attrs = defining.map((a) => attributeWord(a, l)).join(l === "az" ? " və " : " and ");
        return l === "az"
          ? `Hər nümunədə ${definingText} var. Yalnız bir variant ${attrs} baxımından uyğun gəlir: ${describeFigureAt(member, "az")}.`
          : `Every example has ${definingText}. Only one option matches on ${attrs}: ${describeFigureAt(member, "en")}.`;
      }),
      estimatedSeconds: estimateSeconds(difficulty, 26),
      generatorId: classificationGenerator.id,
      seed: "",
      signature: buildSignature(
        "classification",
        examples.map(figureKey).join(";"),
        figureKey(member),
      ),
    };
  },
};

// ---------------------------------------------------------------------------
// Shared text helpers
// ---------------------------------------------------------------------------

function capitalise(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

function lowerFirst(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

export const figuralGenerators: readonly QuestionGenerator[] = [
  matrixGenerator,
  patternGenerator,
  visualSequenceGenerator,
  figuralAnalogyGenerator,
  oddOneOutGenerator,
  classificationGenerator,
];
