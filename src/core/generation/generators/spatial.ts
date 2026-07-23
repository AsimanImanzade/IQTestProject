/**
 * Spatial generators: shape rotation, paper folding and grid overlay.
 *
 * All three work on a shared cell-grid representation, which is what lets one small module cover
 * two categories. Because a grid is just a set of coordinates, every transformation (rotate,
 * mirror, reflect-across-a-fold, union, XOR) is exact integer arithmetic — the correct answer is
 * computed, and the notorious rotation-vs-reflection distinction is guaranteed rather than
 * eyeballed.
 */

import type { Difficulty, GeneratedItem, QuestionGenerator, Rng } from "../../types";
import { buildChoices, estimateSeconds, optionCountFor } from "../choices";
import type { DistractorCandidate } from "../choices";
import { buildSignature } from "../signature";
import { L, localize, type LocalizedString } from "../../i18n";
import { buildLocalized } from "../i18n-helpers";

// ---------------------------------------------------------------------------
// Grid model
// ---------------------------------------------------------------------------

export interface Cell {
  x: number;
  y: number;
}

export interface Grid {
  size: number;
  cells: readonly Cell[];
  /** Optional single cell drawn differently, so orientation stays visible under rotation. */
  marker?: Cell;
}

function cellKey(cell: Cell): string {
  return `${cell.x},${cell.y}`;
}

/** Every cell of a size x size grid, in a stable order. */
function allCells(size: number): Cell[] {
  const cells: Cell[] = [];
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) cells.push({ x, y });
  }
  return cells;
}

/** Canonical, order-independent key for a grid — used for uniqueness and signatures. */
export function gridKey(grid: Grid): string {
  const cells = [...grid.cells].map(cellKey).sort().join(" ");
  return `${grid.size}#${cells}#${grid.marker ? cellKey(grid.marker) : "-"}`;
}

/** Rotate 90 degrees clockwise: (x, y) -> (size - 1 - y, x). */
export function rotate90(grid: Grid): Grid {
  const map = (c: Cell): Cell => ({ x: grid.size - 1 - c.y, y: c.x });
  return {
    size: grid.size,
    cells: grid.cells.map(map),
    marker: grid.marker ? map(grid.marker) : undefined,
  };
}

export function rotateBy(grid: Grid, quarterTurns: number): Grid {
  let result = grid;
  const turns = ((quarterTurns % 4) + 4) % 4;
  for (let i = 0; i < turns; i += 1) result = rotate90(result);
  return result;
}

/** Mirror horizontally: (x, y) -> (size - 1 - x, y). */
export function mirrorX(grid: Grid): Grid {
  const map = (c: Cell): Cell => ({ x: grid.size - 1 - c.x, y: c.y });
  return {
    size: grid.size,
    cells: grid.cells.map(map),
    marker: grid.marker ? map(grid.marker) : undefined,
  };
}

/** Mirror vertically: (x, y) -> (x, size - 1 - y). */
export function mirrorY(grid: Grid): Grid {
  const map = (c: Cell): Cell => ({ x: c.x, y: grid.size - 1 - c.y });
  return {
    size: grid.size,
    cells: grid.cells.map(map),
    marker: grid.marker ? map(grid.marker) : undefined,
  };
}

const GRID_UNIT = 26;

/** Render a grid as SVG. Filled cells use currentColor; the marker is drawn as a ring. */
export function renderGrid(grid: Grid, label: string, showLattice = true): string {
  const dimension = grid.size * GRID_UNIT;
  const parts: string[] = [];

  if (showLattice) {
    parts.push(
      `<rect x="0.75" y="0.75" width="${dimension - 1.5}" height="${dimension - 1.5}" ` +
        `fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" rx="4"/>`,
    );
    for (let i = 1; i < grid.size; i += 1) {
      const p = i * GRID_UNIT;
      parts.push(
        `<line x1="${p}" y1="0" x2="${p}" y2="${dimension}" stroke="currentColor" stroke-width="1" opacity="0.16"/>`,
        `<line x1="0" y1="${p}" x2="${dimension}" y2="${p}" stroke="currentColor" stroke-width="1" opacity="0.16"/>`,
      );
    }
  }

  for (const cell of grid.cells) {
    parts.push(
      `<rect x="${cell.x * GRID_UNIT + 2}" y="${cell.y * GRID_UNIT + 2}" ` +
        `width="${GRID_UNIT - 4}" height="${GRID_UNIT - 4}" fill="currentColor" rx="3"/>`,
    );
  }

  if (grid.marker) {
    const cx = grid.marker.x * GRID_UNIT + GRID_UNIT / 2;
    const cy = grid.marker.y * GRID_UNIT + GRID_UNIT / 2;
    // Drawn as a hole in the filled square so it survives on top of the fill.
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${GRID_UNIT * 0.22}" fill="none" ` +
        `stroke="currentColor" stroke-width="2.5" opacity="0.95"/>`,
      `<circle cx="${cx}" cy="${cy}" r="${GRID_UNIT * 0.22}" fill="var(--color-surface, #fff)" opacity="0.85"/>`,
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" ` +
    `role="img" aria-label="${escapeXml(label)}" class="iq-figure">${parts.join("")}</svg>`
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render several grids in a row with an optional trailing question mark. */
function renderGridRow(grids: readonly Grid[], label: string, withQuestion: boolean): string {
  const size = grids[0]?.size ?? 4;
  const dimension = size * GRID_UNIT;
  const gap = 22;
  const cellCount = grids.length + (withQuestion ? 1 : 0);
  const width = dimension * cellCount + gap * (cellCount - 1);

  const parts = grids.map((grid, index) => {
    const x = index * (dimension + gap);
    const inner = renderGrid(grid, "", true)
      .replace(/^<svg[^>]*>/, "")
      .replace(/<\/svg>$/, "");
    return `<g transform="translate(${x} 0)">${inner}</g>`;
  });

  if (withQuestion) {
    const x = grids.length * (dimension + gap);
    parts.push(
      `<g transform="translate(${x} 0)">` +
        `<rect x="0.75" y="0.75" width="${dimension - 1.5}" height="${dimension - 1.5}" ` +
        `fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3" rx="4"/>` +
        `<text x="${dimension / 2}" y="${dimension / 2}" text-anchor="middle" ` +
        `dominant-baseline="central" font-size="${dimension * 0.4}" font-weight="600" ` +
        `fill="currentColor" font-family="ui-sans-serif, system-ui, sans-serif">?</text></g>`,
    );
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${dimension}" ` +
    `role="img" aria-label="${escapeXml(label)}" class="iq-figure">${parts.join("")}</svg>`
  );
}

// ---------------------------------------------------------------------------
// Random shape construction
// ---------------------------------------------------------------------------

/**
 * Build a connected polyomino. Connectivity matters: a scattered set of cells reads as noise
 * rather than as an object with an orientation.
 */
function randomPolyomino(rng: Rng, size: number, cellCount: number): Grid | null {
  const start: Cell = { x: rng.int(0, size - 1), y: rng.int(0, size - 1) };
  const chosen = new Map<string, Cell>([[cellKey(start), start]]);

  for (let guard = 0; chosen.size < cellCount && guard < 200; guard += 1) {
    const existing = rng.pick([...chosen.values()]);
    const delta = rng.pick([
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]);
    const next: Cell = { x: existing.x + delta.x, y: existing.y + delta.y };
    if (next.x < 0 || next.y < 0 || next.x >= size || next.y >= size) continue;
    chosen.set(cellKey(next), next);
  }

  if (chosen.size !== cellCount) return null;
  const cells = [...chosen.values()];
  // The marker pins orientation, which is what makes rotation distinguishable from reflection.
  const marker = rng.pick(cells);
  return { size, cells, marker };
}

/**
 * A shape is only usable for a rotation item if rotating it actually changes it. A shape with
 * 4-fold symmetry looks identical after every quarter turn, which would make the item
 * unanswerable.
 */
function hasDistinctRotations(grid: Grid): boolean {
  const keys = new Set([0, 1, 2, 3].map((t) => gridKey(rotateBy(grid, t))));
  return keys.size === 4;
}

/** A shape whose mirror equals one of its rotations cannot support a mirror distractor. */
function mirrorIsDistinct(grid: Grid): boolean {
  const rotations = new Set([0, 1, 2, 3].map((t) => gridKey(rotateBy(grid, t))));
  return !rotations.has(gridKey(mirrorX(grid)));
}

// ---------------------------------------------------------------------------
// Shape rotation
// ---------------------------------------------------------------------------

const shapeRotationGenerator: QuestionGenerator = {
  id: "spatial.rotation",
  category: "shape-rotation",
  supportedDifficulties: [2, 3, 4, 5, 6, 7, 8, 9],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    const size = difficulty <= 4 ? 3 : 4;
    const cellCount = difficulty <= 4 ? 4 : difficulty <= 7 ? 5 : 6;

    const shape = randomPolyomino(rng, size, cellCount);
    if (!shape) return null;
    if (!hasDistinctRotations(shape)) return null;
    if (!mirrorIsDistinct(shape)) return null;

    const turns = rng.pick(difficulty <= 3 ? [1, 2] : [1, 2, 3]);
    const degrees = turns * 90;
    const answer = rotateBy(shape, turns);

    const candidates: DistractorCandidate<Grid>[] = [
      {
        value: mirrorX(answer),
        rationale: L(
          "This is the mirror image of the correct answer, not a rotation. Reflections cannot be produced by turning a shape in the plane.",
          "Bu, düzgün cavabın güzgü əksidir, fırlanma deyil. Əkslər fiquru müstəvidə fırlatmaqla alına bilməz.",
        ),
      },
      {
        value: rotateBy(shape, turns + 1),
        rationale: L("Rotated 90° too far.", "90° artıq fırladıb."),
      },
      {
        value: rotateBy(shape, turns - 1),
        rationale: L("Rotated 90° short of the required angle.", "Tələb olunan bucaqdan 90° az fırladıb."),
      },
      {
        value: mirrorY(answer),
        rationale: L("A reflection across the horizontal axis rather than a rotation.", "Fırlanma yox, üfüqi ox üzrə əksdir."),
      },
      {
        value: rotateBy(shape, turns + 2),
        rationale: L("Rotated 180° beyond the required angle.", "Tələb olunan bucaqdan 180° artıq fırladıb."),
      },
    ];

    const choices = buildChoices({
      rng,
      correct: answer,
      correctRationale: L(
        `The shape turned ${degrees}° clockwise, with the marker moving accordingly.`,
        `Fiqur saat əqrəbi istiqamətində ${degrees}° fırlandı və nişan da müvafiq şəkildə yerini dəyişdi.`,
      ),
      candidates,
      optionCount: optionCountFor(difficulty),
      keyOf: gridKey,
      render: (grid) => ({ svg: renderGrid(grid, "Answer option shape") }),
    });
    if (!choices) return null;

    return {
      category: "shape-rotation",
      difficulty,
      stem: L(
        `How does this shape look after being rotated ${degrees}° clockwise?`,
        `Bu fiqur saat əqrəbi istiqamətində ${degrees}° fırladıldıqdan sonra necə görünür?`,
      ),
      svg: renderGrid(shape, "A shape drawn on a grid with a small ring marking one cell"),
      choices,
      explanation: buildLocalized((l) =>
        l === "az"
          ? `Saat əqrəbi istiqamətində ${degrees}° fırlatma hər (x, y) xanasını (${size - 1}−y, x) mövqeyinə aparır` +
            `${turns > 1 ? `, ${turns} dəfə tətbiq olunur` : ""}. ` +
            `Halqa nişanı istiqaməti izləyir — onu əks tərəfə qoyan variantlar güzgü əksidir və fırlanma bunu heç vaxt yarada bilməz.`
          : `Rotating ${degrees}° clockwise sends each cell at (x, y) to (${size - 1}−y, x)` +
            `${turns > 1 ? `, applied ${turns} times` : ""}. ` +
            `The ring marker tracks the orientation — options that place it on the opposite side are mirror images, which a rotation can never produce.`,
      ),
      estimatedSeconds: estimateSeconds(difficulty, 32),
      generatorId: shapeRotationGenerator.id,
      seed: "",
      signature: buildSignature("shape-rotation", gridKey(shape), degrees),
    };
  },
};

// ---------------------------------------------------------------------------
// Paper folding
// ---------------------------------------------------------------------------

type FoldAxis = "vertical" | "horizontal";

/**
 * Simulate punching holes through a folded sheet and unfolding it.
 * Each fold doubles the holes by reflecting them across the fold line, applied in reverse order.
 */
function unfold(size: number, punches: readonly Cell[], folds: readonly FoldAxis[]): Cell[] {
  let current = new Map<string, Cell>(punches.map((p) => [cellKey(p), p]));

  for (let i = folds.length - 1; i >= 0; i -= 1) {
    const axis = folds[i];
    const next = new Map(current);
    for (const cell of current.values()) {
      const reflected: Cell =
        axis === "vertical"
          ? { x: size - 1 - cell.x, y: cell.y }
          : { x: cell.x, y: size - 1 - cell.y };
      next.set(cellKey(reflected), reflected);
    }
    current = next;
  }

  return [...current.values()];
}

const paperFoldingGenerator: QuestionGenerator = {
  id: "spatial.paper-folding",
  category: "spatial-reasoning",
  supportedDifficulties: [3, 4, 5, 6, 7, 8, 9, 10],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    // Grid size scales with difficulty for a structural reason: a 4x4 sheet folded twice exposes
    // only a 2x2 region, which admits about five distinct punch patterns in total — not enough to
    // fill the hard difficulty bands. A 6x6 sheet exposes 3x3 and yields hundreds.
    const size = difficulty <= 6 ? 4 : 6;
    const foldCount = difficulty <= 5 ? 1 : 2;
    // Vary the punch count within a difficulty band rather than fixing it. The space of distinct
    // folded configurations is small (a two-fold sheet exposes only four cells), so a fixed count
    // makes signature collisions the dominant failure mode.
    const punchCount =
      difficulty <= 4
        ? rng.pick([1, 2])
        : difficulty <= 8
          ? rng.pick([2, 3])
          : rng.pick([3, 4]);

    const folds: FoldAxis[] =
      foldCount === 1
        ? [rng.pick(["vertical", "horizontal"] as const)]
        : ["vertical", "horizontal"];

    // Punches are made in the region that remains exposed after folding, so that unfolding
    // genuinely multiplies them.
    const maxX = folds.includes("vertical") ? size / 2 - 1 : size - 1;
    const maxY = folds.includes("horizontal") ? size / 2 - 1 : size - 1;

    const available: Cell[] = [];
    for (let x = 0; x <= maxX; x += 1) {
      for (let y = 0; y <= maxY; y += 1) available.push({ x, y });
    }
    if (available.length < punchCount) return null;

    const punches = rng.sample(available, punchCount);
    const answerCells = unfold(size, punches, folds);
    const answer: Grid = { size, cells: answerCells };

    // Each punch must genuinely duplicate, otherwise the item is trivial.
    if (answerCells.length !== punchCount * 2 ** foldCount) return null;

    const foldedGrid: Grid = { size, cells: punches };

    const candidates: DistractorCandidate<Grid>[] = [
      {
        value: { size, cells: punches },
        rationale: L("Shows the holes as punched, forgetting that unfolding reflects them.", "Dəlikləri deşildiyi kimi göstərir, açılmanın onları əks etdirdiyini unudur."),
      },
      {
        value: { size, cells: unfold(size, punches, folds.slice(0, 1)) },
        rationale: L("Unfolded only one of the folds.", "Qatlardan yalnız birini açıb."),
      },
      {
        value: { size, cells: mirrorX({ size, cells: answerCells }).cells },
        rationale: L("Reflected the whole result instead of reflecting each hole across the fold.", "Hər dəliyi qat xətti üzrə əks etdirmək əvəzinə bütün nəticəni əks etdirib."),
      },
      {
        value: {
          size,
          cells: unfold(size, punches, [folds[0] === "vertical" ? "horizontal" : "vertical"]),
        },
        rationale: L("Reflected across the wrong axis.", "Yanlış ox üzrə əks etdirib."),
      },
      {
        value: { size, cells: rotate90({ size, cells: answerCells }).cells },
        rationale: L("Rotated the sheet rather than unfolding it.", "Vərəqi açmaq əvəzinə onu fırladıb."),
      },
      // The reflection-based distractors above can coincide with the answer: an unfolded sheet is
      // symmetric across its own fold lines, so mirroring it is sometimes a no-op. These two
      // miscount distractors are guaranteed distinct and keep the item viable.
      {
        value: { size, cells: answerCells.slice(0, answerCells.length - 1) },
        rationale: L("Missed one of the reflected holes.", "Əks olunmuş dəliklərdən birini buraxıb."),
      },
      {
        value: {
          size,
          cells: [
            ...answerCells,
            // Empty when the sheet is already fully punched, in which case this candidate
            // collides with the answer and is dropped by the de-duplicator.
            ...allCells(size)
              .filter((c) => !answerCells.some((a) => a.x === c.x && a.y === c.y))
              .slice(0, 1),
          ],
        },
        rationale: L("Produced one hole too many.", "Bir dəlik artıq yaradıb."),
      },
    ];

    const choices = buildChoices({
      rng,
      correct: answer,
      correctRationale: L(
        "Each hole is reflected across every fold line as the sheet opens.",
        "Vərəq açıldıqca hər dəlik hər qat xətti üzrə əks olunur.",
      ),
      candidates,
      optionCount: optionCountFor(difficulty),
      keyOf: gridKey,
      render: (grid) => ({ svg: renderGrid(grid, "Answer option: unfolded sheet") }),
    });
    if (!choices) return null;

    const foldWordsEn = folds.map((f) => (f === "vertical" ? "left over right" : "top over bottom"));
    const foldWordsAz = folds.map((f) => (f === "vertical" ? "soldan sağa" : "yuxarıdan aşağıya"));

    return {
      category: "spatial-reasoning",
      difficulty,
      stem: buildLocalized((l) =>
        l === "az"
          ? `Kvadrat vərəq ${foldWordsAz.join(", sonra ")} qatlanır. ` +
            `Sonra göstərilən ${punchCount === 1 ? "mövqedə" : "mövqelərdə"} bütün qatlardan ` +
            `${punchCount} dəlik deşilir. Vərəq açıldıqdan sonra hansı şəkil doğrudur?`
          : `A square sheet is folded ${foldWordsEn.join(", then ")}. ` +
            `${punchCount} hole${punchCount === 1 ? " is" : "s are"} then punched through all layers ` +
            `at the position${punchCount === 1 ? "" : "s"} shown. ` +
            `Which picture shows the sheet after it is unfolded?`,
      ),
      svg: renderGrid(foldedGrid, "The folded sheet showing where the holes are punched"),
      choices,
      explanation: buildLocalized((l) =>
        l === "az"
          ? `Açılma hər qatı geri qaytarır və hər dəlik həmin qat xətti üzrə əks olunur. ` +
            `${foldCount} qatla hər deşik ${2 ** foldCount} dəliyə çevrilir, cəmi ${answerCells.length} dəlik alınır.`
          : `Unfolding reverses each fold, and every hole reflects across that fold line. ` +
            `With ${foldCount} fold${foldCount === 1 ? "" : "s"}, each punch becomes ` +
            `${2 ** foldCount} holes, giving ${answerCells.length} in total.`,
      ),
      estimatedSeconds: estimateSeconds(difficulty, 38),
      generatorId: paperFoldingGenerator.id,
      seed: "",
      signature: buildSignature(
        "spatial-paper-folding",
        gridKey(foldedGrid),
        folds.join("+"),
      ),
    };
  },
};

// ---------------------------------------------------------------------------
// Grid overlay
// ---------------------------------------------------------------------------

type OverlayOp = "union" | "xor" | "intersection";

function combine(a: Grid, b: Grid, op: OverlayOp): Grid {
  const setA = new Set(a.cells.map(cellKey));
  const setB = new Set(b.cells.map(cellKey));
  const cells: Cell[] = [];

  for (let x = 0; x < a.size; x += 1) {
    for (let y = 0; y < a.size; y += 1) {
      const key = `${x},${y}`;
      const inA = setA.has(key);
      const inB = setB.has(key);
      const keep =
        op === "union" ? inA || inB : op === "intersection" ? inA && inB : inA !== inB;
      if (keep) cells.push({ x, y });
    }
  }

  return { size: a.size, cells };
}

const gridOverlayGenerator: QuestionGenerator = {
  id: "spatial.overlay",
  category: "spatial-reasoning",
  supportedDifficulties: [2, 3, 4, 5, 6, 7, 8],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    const size = 4;
    const op: OverlayOp = difficulty <= 3 ? "union" : difficulty <= 6 ? "xor" : rng.pick(["xor", "intersection"] as const);

    const density = difficulty <= 4 ? 5 : 6;
    const pick = (): Grid => {
      const all: Cell[] = [];
      for (let x = 0; x < size; x += 1) for (let y = 0; y < size; y += 1) all.push({ x, y });
      return { size, cells: rng.sample(all, density) };
    };

    const a = pick();
    const b = pick();
    const answer = combine(a, b, op);

    // Degenerate results measure nothing.
    if (answer.cells.length === 0 || answer.cells.length >= size * size) return null;
    if (gridKey(answer) === gridKey(a) || gridKey(answer) === gridKey(b)) return null;

    const opWord: Record<OverlayOp, LocalizedString> = {
      union: L(
        "a cell is filled if it is filled in either grid",
        "xana hər hansı iki tordan birində doludursa, dolu olur",
      ),
      xor: L(
        "a cell is filled only if it is filled in exactly one of the two grids",
        "xana yalnız iki tordan tam birində doludursa, dolu olur",
      ),
      intersection: L(
        "a cell is filled only if it is filled in both grids",
        "xana yalnız hər iki torda doludursa, dolu olur",
      ),
    };

    const candidates: DistractorCandidate<Grid>[] = (
      ["union", "xor", "intersection"] as const
    )
      .filter((other) => other !== op)
      .map((other) => ({
        value: combine(a, b, other),
        rationale: buildLocalized((l) =>
          l === "az"
            ? `Yanlış birləşdirmə qaydası tətbiq edib — bu, ${localize(opWord[other], "az")} olan haldakı nəticədir.`
            : `Applied the wrong combining rule — this is the result when ${localize(opWord[other], "en")}.`,
        ),
      }));

    candidates.push(
      { value: a, rationale: L("Reproduced the first grid without combining.", "Birləşdirmədən birinci toru təkrarlayıb.") },
      { value: b, rationale: L("Reproduced the second grid without combining.", "Birləşdirmədən ikinci toru təkrarlayıb.") },
      {
        value: mirrorX(answer),
        rationale: L("Correct combination, but mirrored.", "Düzgün birləşmə, lakin güzgü əksində."),
      },
    );

    const choices = buildChoices({
      rng,
      correct: answer,
      correctRationale: buildLocalized((l) =>
        l === "az"
          ? `Belə birləşdirilib: ${localize(opWord[op], "az")}.`
          : `Combined so that ${localize(opWord[op], "en")}.`,
      ),
      candidates,
      optionCount: optionCountFor(difficulty),
      keyOf: gridKey,
      render: (grid) => ({ svg: renderGrid(grid, "Answer option grid") }),
    });
    if (!choices) return null;

    return {
      category: "spatial-reasoning",
      difficulty,
      stem: L(
        `The two grids below are combined by a single consistent rule. Which grid is the result?`,
        `Aşağıdakı iki tor vahid ardıcıl qayda ilə birləşdirilir. Nəticə hansı tordur?`,
      ),
      svg: renderGridRow([a, b], "Two grids to be combined", true),
      choices,
      explanation: buildLocalized((l) =>
        l === "az"
          ? `Qayda budur: ${localize(opWord[op], "az")}. Onu xana-xana tətbiq etmək cavabı verir.`
          : `The rule is that ${localize(opWord[op], "en")}. Applying it cell by cell gives the answer.`,
      ),
      estimatedSeconds: estimateSeconds(difficulty, 30),
      generatorId: gridOverlayGenerator.id,
      seed: "",
      signature: buildSignature("spatial-overlay", gridKey(a), gridKey(b), op),
    };
  },
};

export const spatialGenerators: readonly QuestionGenerator[] = [
  shapeRotationGenerator,
  paperFoldingGenerator,
  gridOverlayGenerator,
];
