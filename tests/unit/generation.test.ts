import { describe, expect, it } from "vitest";
import { createRng, deriveSeed } from "@/core/generation/rng";
import { ALL_GENERATORS, generatorsForDifficulty } from "@/core/generation/registry";
import { validateItem } from "@/core/generation/validate";
import { buildBank } from "@/core/generation/bank";
import { contentHash } from "@/core/generation/signature";
import { CATEGORY_SLUGS, type Difficulty } from "@/core/types";
import { L, localize } from "@/core/i18n";
import { figureAt, buildRuleSet } from "@/core/generation/svg/rules";
import { figureKey } from "@/core/generation/svg/figure";
import { gridKey, mirrorX, rotateBy } from "@/core/generation/generators/spatial";

describe("seeded RNG", () => {
  it("produces identical streams for identical seeds", () => {
    const a = createRng("alpha");
    const b = createRng("alpha");
    const left = Array.from({ length: 50 }, () => a.next());
    const right = Array.from({ length: 50 }, () => b.next());
    expect(left).toEqual(right);
  });

  it("produces different streams for adjacent seeds", () => {
    // Seeds really are adjacent strings in production ("bank:matrix:7:41"), so a weak seed hash
    // would correlate consecutive items.
    const a = Array.from({ length: 20 }, () => createRng("bank:matrix:7:1").next());
    const b = Array.from({ length: 20 }, () => createRng("bank:matrix:7:2").next());
    expect(a).not.toEqual(b);
  });

  it("keeps int() within the requested inclusive bounds", () => {
    const rng = createRng("bounds");
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.int(3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("shuffle is a permutation, preserving every element", () => {
    const rng = createRng("shuffle");
    const input = Array.from({ length: 30 }, (_, i) => i);
    for (let i = 0; i < 100; i += 1) {
      const out = rng.shuffle(input);
      expect(out).toHaveLength(input.length);
      expect([...out].sort((x, y) => x - y)).toEqual(input);
    }
  });

  it("sample returns distinct elements and refuses over-sampling", () => {
    const rng = createRng("sample");
    const input = [1, 2, 3, 4, 5];
    const out = rng.sample(input, 3);
    expect(new Set(out).size).toBe(3);
    expect(() => rng.sample(input, 6)).toThrow();
  });
});

describe("content hashing", () => {
  it("is stable and avalanches on small input changes", () => {
    expect(contentHash("abc")).toBe(contentHash("abc"));
    expect(contentHash("abc")).not.toBe(contentHash("abd"));
    expect(contentHash("abc")).toHaveLength(32);
  });
});

describe("figural rule engine", () => {
  it("computes grid positions by independent re-derivation", () => {
    // Re-implement the index arithmetic here rather than calling the production helper, so the
    // test genuinely checks the rule semantics instead of restating them.
    const rng = createRng("rules");
    for (let trial = 0; trial < 200; trial += 1) {
      const built = buildRuleSet(rng, { attributeCount: 2, domainSize: 3, twoDimensional: true });
      if (!built) continue;
      const { base, rules } = built;

      for (let row = 0; row < 3; row += 1) {
        for (let col = 0; col < 3; col += 1) {
          const figure = figureAt(base, rules, row, col);
          for (const rule of rules) {
            const size = rule.values.length;
            const expectedIndex =
              ((rule.baseIndex + col * rule.rowStep + row * rule.colStep) % size + size) % size;
            expect(figure[rule.attribute]).toBe(rule.values[expectedIndex]);
          }
        }
      }
    }
  });
});

describe("grid transforms", () => {
  const shape = { size: 4, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }] };

  it("four quarter turns return the original", () => {
    expect(gridKey(rotateBy(shape, 4))).toBe(gridKey(shape));
  });

  it("mirroring twice returns the original", () => {
    expect(gridKey(mirrorX(mirrorX(shape)))).toBe(gridKey(shape));
  });

  it("a rotation is never equal to a reflection for a chiral shape", () => {
    // This is the property the shape-rotation distractors depend on: if a mirror image were
    // reachable by rotation, the "mirror" distractor would silently be a second correct answer.
    const chiral = { size: 3, cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }] };
    const rotations = new Set([0, 1, 2, 3].map((t) => gridKey(rotateBy(chiral, t))));
    expect(rotations.has(gridKey(mirrorX(chiral)))).toBe(false);
  });
});

describe("every generator, across every difficulty it supports", () => {
  for (const generator of ALL_GENERATORS) {
    describe(generator.id, () => {
      it("produces only items that pass validation", () => {
        let produced = 0;

        for (const difficulty of generator.supportedDifficulties) {
          for (let seed = 0; seed < 60; seed += 1) {
            const rng = createRng(deriveSeed("test", generator.id, difficulty, seed));
            const item = generator.generate(rng, difficulty);
            // Returning null is a legitimate refusal (ambiguous set, symmetric shape), not a
            // failure — the bank builder simply retries with the next seed.
            if (!item) continue;
            produced += 1;

            const result = validateItem({ ...item, seed: "test" });
            if (!result.valid) {
              throw new Error(
                `${generator.id} d${difficulty} seed ${seed} invalid: ` +
                  result.issues.map((i) => `${i.code} (${i.message})`).join("; "),
              );
            }

            expect(item.category).toBe(generator.category);
            expect(item.difficulty).toBe(difficulty);
            expect(item.choices.filter((c) => c.isCorrect)).toHaveLength(1);

            // Every option must be distinguishable from every other, or more than one answer
            // becomes defensible.
            const keys = item.choices.map((c) => `${c.text ? localize(c.text, "en") : ""}|${c.svg ?? ""}`);
            expect(new Set(keys).size).toBe(keys.length);

            // Every distractor must carry a stated reasoning error, in BOTH languages.
            for (const choice of item.choices) {
              expect(localize(choice.rationale, "en").trim().length).toBeGreaterThan(0);
              expect(localize(choice.rationale, "az").trim().length).toBeGreaterThan(0);
            }

            // Full-translation guarantee: every user-facing string carries Azerbaijani.
            const strings = [item.stem, item.explanation, ...item.choices.flatMap((c) => c.text ? [c.text, c.rationale] : [c.rationale])];
            for (const s of strings) {
              expect(typeof s.az === "string" && s.az.length > 0, `missing az in ${item.generatorId}`).toBe(true);
            }
          }
        }

        // A generator that refuses everything would otherwise pass this test vacuously.
        expect(produced).toBeGreaterThan(0);
      });

      it("is deterministic — the same seed reproduces byte-identical output", () => {
        const difficulty = generator.supportedDifficulties[0] as Difficulty;
        for (let seed = 0; seed < 15; seed += 1) {
          const key = deriveSeed("determinism", generator.id, seed);
          const first = generator.generate(createRng(key), difficulty);
          const second = generator.generate(createRng(key), difficulty);
          expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        }
      });
    });
  }
});

describe("validator", () => {
  const base = {
    category: "number-series" as const,
    difficulty: 3 as Difficulty,
    stem: L("What comes next? 2, 4, 6, ?", "Növbəti nədir? 2, 4, 6, ?"),
    choices: [
      { text: L("8", "8"), isCorrect: true, rationale: L("Adds two each time.", "Hər dəfə iki əlavə edir.") },
      { text: L("9", "9"), isCorrect: false, rationale: L("Off by one.", "Bir səhv.") },
      { text: L("10", "10"), isCorrect: false, rationale: L("Skipped a step.", "Bir addım ötürdü.") },
      { text: L("7", "7"), isCorrect: false, rationale: L("Wrong direction.", "Yanlış istiqamət.") },
    ],
    explanation: L("Each term increases by two.", "Hər üzv iki qədər artır."),
    estimatedSeconds: 30,
    generatorId: "test",
    seed: "test",
    signature: "sig",
  };

  it("accepts a well-formed item", () => {
    expect(validateItem(base).valid).toBe(true);
  });

  it("rejects an item with no correct answer", () => {
    const item = { ...base, choices: base.choices.map((c) => ({ ...c, isCorrect: false })) };
    expect(validateItem(item).issues.map((i) => i.code)).toContain("no-correct-answer");
  });

  it("rejects an item with two correct answers", () => {
    const choices = base.choices.map((c, i) => ({ ...c, isCorrect: i < 2 }));
    expect(validateItem({ ...base, choices }).issues.map((i) => i.code)).toContain(
      "multiple-correct-answers",
    );
  });

  it("rejects duplicate options", () => {
    const choices = [...base.choices];
    choices[1] = { text: L("8", "8"), isCorrect: false, rationale: L("duplicate", "təkrar") };
    expect(validateItem({ ...base, choices }).issues.map((i) => i.code)).toContain(
      "duplicate-choices",
    );
  });

  it("rejects an out-of-range difficulty", () => {
    const item = { ...base, difficulty: 14 as Difficulty };
    expect(validateItem(item).issues.map((i) => i.code)).toContain("difficulty-out-of-range");
  });

  it("rejects truncated figure markup", () => {
    const item = { ...base, svg: "<svg><circle /" };
    expect(validateItem(item).issues.map((i) => i.code)).toContain("malformed-svg");
  });
});

describe("bank assembly", () => {
  // 240 items keeps the suite fast while still exercising every category and difficulty.
  const bank = buildBank({ targetCount: 240, seed: "unit-test-bank" });

  it("produces the requested number of items", () => {
    expect(bank.items.length).toBeGreaterThanOrEqual(228); // >= 95% yield
  });

  it("assigns every signature exactly once", () => {
    const signatures = bank.items.map((i) => i.signature);
    expect(new Set(signatures).size).toBe(signatures.length);
  });

  it("covers every category", () => {
    for (const category of CATEGORY_SLUGS) {
      expect(bank.byCategory[category] ?? 0).toBeGreaterThan(0);
    }
  });

  it("covers every difficulty level", () => {
    for (let d = 1; d <= 10; d += 1) {
      expect(bank.byDifficulty[d] ?? 0).toBeGreaterThan(0);
    }
  });

  it("weights the bank towards the middle, matching blueprint demand", () => {
    const easy = [1, 2, 3].reduce((s, d) => s + (bank.byDifficulty[d] ?? 0), 0);
    const medium = [4, 5, 6].reduce((s, d) => s + (bank.byDifficulty[d] ?? 0), 0);
    // The blueprint consumes twice as many medium items as easy ones, so the bank must hold
    // more of them or the medium stratum drains first and retakes start repeating.
    expect(medium).toBeGreaterThan(easy);
  });

  it("is reproducible from its seed", () => {
    const again = buildBank({ targetCount: 240, seed: "unit-test-bank" });
    expect(again.items.map((i) => i.signature)).toEqual(bank.items.map((i) => i.signature));
  });

  it("gives harder items five options to lower the guessing floor", () => {
    const hard = bank.items.filter((i) => i.difficulty >= 7);
    expect(hard.length).toBeGreaterThan(0);
    for (const item of hard) expect(item.choices).toHaveLength(5);
  });

  it("produces a substantial proportion of visual items", () => {
    const withFigures = bank.items.filter((i) => i.svg).length;
    expect(withFigures / bank.items.length).toBeGreaterThan(0.4);
  });
});

describe("figural determinism", () => {
  it("renders byte-identical SVG for the same figure", () => {
    const rng = createRng("svg-determinism");
    const generator = generatorsForDifficulty("matrix-reasoning", 6)[0];
    expect(generator).toBeDefined();

    const first = generator!.generate(createRng("fixed-seed"), 6);
    const second = generator!.generate(createRng("fixed-seed"), 6);
    expect(first?.svg).toBe(second?.svg);
    expect(first?.svg).toContain("<svg");
    // Figures inherit the theme colour rather than hard-coding one, so they work in dark mode.
    expect(first?.svg).toContain("currentColor");
    void rng;
  });

  it("never encodes information in colour alone", () => {
    // A reasoning item solvable only by distinguishing hues would disadvantage colour-blind
    // test-takers. Figures are monochrome by construction; this guards that invariant.
    const bank = buildBank({ targetCount: 120, seed: "colour-check" });
    const figures = bank.items.flatMap((i) => [i.svg, ...i.choices.map((c) => c.svg)]);
    for (const svg of figures) {
      if (!svg) continue;
      expect(svg).not.toMatch(/#[0-9a-f]{6}/i);
      expect(svg).not.toMatch(/\b(red|blue|green|orange|purple|yellow)\b/i);
    }
  });
});

describe("figure geometry stays inside its viewBox", () => {
  /**
   * Every drawn coordinate must fall within the SVG's own viewBox. Overflow is the failure mode
   * that would not show up in any other test: the markup stays valid, the item validates, and
   * the figure simply renders clipped — producing an unanswerable question that looks fine in
   * the database.
   */
  function assertWithinViewBox(svg: string): void {
    const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
    expect(viewBox, `missing viewBox in ${svg.slice(0, 80)}`).not.toBeNull();
    const width = Number(viewBox![1]);
    const height = Number(viewBox![2]);

    // Stroke width is 2.5, so half of it can legitimately sit outside the nominal shape bounds.
    const slack = 3;

    // Coordinates inside a <g transform="translate(...)"> or rotate() are relative, so only
    // untransformed top-level primitives can be checked absolutely. Rotation happens about the
    // shape's own centre and never enlarges its bounding circle, so this stays sound.
    for (const match of svg.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="([-\d.]+)"/g)) {
      const cx = Number(match[1]);
      const cy = Number(match[2]);
      const r = Number(match[3]);
      expect(cx - r).toBeGreaterThanOrEqual(-slack);
      expect(cy - r).toBeGreaterThanOrEqual(-slack);
      expect(cx + r).toBeLessThanOrEqual(width + slack);
      expect(cy + r).toBeLessThanOrEqual(height + slack);
    }
  }

  it("holds for single-figure option renderings", () => {
    const bank = buildBank({ targetCount: 200, seed: "geometry" });
    let checked = 0;
    for (const item of bank.items) {
      for (const choice of item.choices) {
        if (!choice.svg) continue;
        assertWithinViewBox(choice.svg);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("holds for question figures", () => {
    const bank = buildBank({ targetCount: 200, seed: "geometry-stem" });
    let checked = 0;
    for (const item of bank.items) {
      if (!item.svg) continue;
      assertWithinViewBox(item.svg);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("declares an accessible label on every figure", () => {
    const bank = buildBank({ targetCount: 120, seed: "a11y" });
    for (const item of bank.items) {
      for (const svg of [item.svg, ...item.choices.map((c) => c.svg)]) {
        if (!svg) continue;
        expect(svg).toContain('role="img"');
        expect(svg).toMatch(/aria-label="[^"]/);
      }
    }
  });
});

describe("figure keys", () => {
  it("distinguishes figures differing on any single attribute", () => {
    const a = { shape: "circle", fill: "solid", size: "medium", rotation: 0, count: 2 } as const;
    expect(figureKey(a)).toBe(figureKey({ ...a }));
    expect(figureKey(a)).not.toBe(figureKey({ ...a, count: 3 }));
    expect(figureKey(a)).not.toBe(figureKey({ ...a, fill: "none" }));
  });
});
