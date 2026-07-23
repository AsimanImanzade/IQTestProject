/**
 * Logic generators: categorical syllogisms, ordering puzzles, knights-and-knaves, and
 * conditional reasoning.
 *
 * Every item here is verified by an actual solver rather than by an authored key:
 *   * syllogisms are checked by enumerating finite models and confirming the conclusion holds in
 *     *every* model satisfying the premises — and, critically, that no other offered option does
 *   * ordering puzzles brute-force all permutations and are discarded unless exactly one
 *     satisfies the constraints
 *   * knights-and-knaves enumerates all truth assignments and requires a unique consistent one
 *
 * Uniqueness is the whole game in this category. A logic item with two defensible answers is
 * worse than no item at all, so each generator rejects rather than guesses.
 */

import type { Difficulty, GeneratedItem, QuestionGenerator, Rng } from "../../types";
import { estimateSeconds, optionCountFor } from "../choices";
import { buildSignature } from "../signature";
import type { GeneratedChoice } from "../../types";
import { L, type Locale, type LocalizedString } from "../../i18n";
import { buildLocalized } from "../i18n-helpers";

/**
 * Azerbaijani translations of the content nouns used in syllogisms. The English strings remain the
 * stable keys the solver reasons over; these are display-only. Syllogism propositions are phrased
 * with the invariant frame "… sinfinə aiddir / aid deyil" (belongs to / does not belong to the
 * class of …) so no per-noun copula agreement is needed.
 */
const TERM_AZ: Record<string, string> = {
  gardeners: "bağbanlar", cyclists: "velosipedçilər", engineers: "mühəndislər",
  novels: "romanlar", hardbacks: "bərk cildli kitablar", translations: "tərcümələr",
  falcons: "şahinlər", migrants: "köçəri quşlar", predators: "yırtıcılar",
  violinists: "skripkaçılar", teachers: "müəllimlər", graduates: "məzunlar",
  reptiles: "sürünənlər", swimmers: "üzənlər", "nocturnal animals": "gecə heyvanları",
  ceramics: "keramika məmulatları", exports: "ixrac malları", "handmade items": "əl işləri",
  archivists: "arxivçilər", linguists: "dilçilər", volunteers: "könüllülər",
  orchards: "meyvə bağları", "protected sites": "qorunan ərazilər", wetlands: "sulaq ərazilər",
  glaciers: "buzlaqlar", "shrinking features": "kiçilən obyektlər", "monitored sites": "izlənən ərazilər",
  potters: "dulusçular", tutors: "repetitorlar", islanders: "ada sakinləri",
  ferries: "bərələr", "diesel vessels": "dizel gəmiləri", "licensed craft": "lisenziyalı gəmilər",
  mosses: "mamırlar", "shade plants": "kölgə bitkiləri", "protected species": "qorunan növlər",
  auditors: "auditorlar", statisticians: "statistiklər", "board members": "idarə heyəti üzvləri",
  quarries: "karxanalar", "restored sites": "bərpa olunmuş ərazilər", "public land": "dövlət torpaqları",
  bakeries: "çörəkxanalar", "family businesses": "ailə biznesləri", exporters: "ixracatçılar",
  telescopes: "teleskoplar", "donated instruments": "bağışlanmış cihazlar", "working devices": "işlək cihazlar",
};

function termWord(term: string, locale: Locale): string {
  return locale === "az" ? TERM_AZ[term] ?? term : term;
}

/** Ablative ("-dan/-dən") forms of the six ordering names — a fixed set, so tabulated exactly. */
const ABLATIVE_AZ: Record<string, string> = {
  Ana: "Anadan", Ben: "Bendən", Cleo: "Cleodan", Dev: "Devdən", Elif: "Elifdən", Farid: "Fariddən",
};

const ORDINAL_AZ = ["birinci", "ikinci", "üçüncü", "dördüncü", "beşinci", "altıncı"];

// ---------------------------------------------------------------------------
// Categorical syllogisms
// ---------------------------------------------------------------------------

type Quantifier = "all" | "no" | "some" | "some-not";

interface Proposition {
  quantifier: Quantifier;
  subject: string;
  predicate: string;
}

function propositionText(p: Proposition, locale: Locale): string {
  const s = termWord(p.subject, locale);
  const t = termWord(p.predicate, locale);
  if (locale === "az") {
    switch (p.quantifier) {
      case "all":
        return `Bütün ${s} ${t} sinfinə aiddir`;
      case "no":
        return `Heç bir ${s} ${t} sinfinə aid deyil`;
      case "some":
        return `Bəzi ${s} ${t} sinfinə aiddir`;
      case "some-not":
        return `Bəzi ${s} ${t} sinfinə aid deyil`;
      default: {
        const exhaustive: never = p.quantifier;
        throw new Error(`Unhandled quantifier: ${String(exhaustive)}`);
      }
    }
  }
  switch (p.quantifier) {
    case "all":
      return `All ${s} are ${t}`;
    case "no":
      return `No ${s} are ${t}`;
    case "some":
      return `Some ${s} are ${t}`;
    case "some-not":
      return `Some ${s} are not ${t}`;
    default: {
      const exhaustive: never = p.quantifier;
      throw new Error(`Unhandled quantifier: ${String(exhaustive)}`);
    }
  }
}

/**
 * A model assigns each term a subset of a small finite universe, encoded as a bitmask.
 * Enumerating every model over a 3-element universe is exact for syllogistic validity: any
 * counterexample to a syllogism can be built with at most three individuals.
 */
const UNIVERSE = 3;
const SUBSET_COUNT = 1 << UNIVERSE; // 8

function holds(p: Proposition, assign: Record<string, number>): boolean {
  const s = assign[p.subject] ?? 0;
  const t = assign[p.predicate] ?? 0;
  switch (p.quantifier) {
    case "all":
      return (s & ~t & (SUBSET_COUNT - 1)) === 0;
    case "no":
      return (s & t) === 0;
    case "some":
      return (s & t) !== 0;
    case "some-not":
      return (s & ~t & (SUBSET_COUNT - 1)) !== 0;
    default: {
      const exhaustive: never = p.quantifier;
      throw new Error(`Unhandled quantifier: ${String(exhaustive)}`);
    }
  }
}

/**
 * Validity check under the traditional (Aristotelian) reading, where every term is assumed
 * non-empty. This matches lay intuition — "All A are B, therefore some A are B" reads as valid
 * to almost everyone — and keeps the classically valid forms available.
 */
function isValid(premises: readonly Proposition[], conclusion: Proposition, terms: readonly string[]): boolean {
  for (let a = 1; a < SUBSET_COUNT; a += 1) {
    for (let b = 1; b < SUBSET_COUNT; b += 1) {
      for (let c = 1; c < SUBSET_COUNT; c += 1) {
        const assign: Record<string, number> = {};
        assign[terms[0] as string] = a;
        assign[terms[1] as string] = b;
        assign[terms[2] as string] = c;

        if (!premises.every((p) => holds(p, assign))) continue;
        if (!holds(conclusion, assign)) return false; // counterexample found
      }
    }
  }
  return true;
}

const SYLLOGISM_TERMS: readonly (readonly [string, string, string])[] = [
  ["gardeners", "cyclists", "engineers"],
  ["novels", "hardbacks", "translations"],
  ["falcons", "migrants", "predators"],
  ["violinists", "teachers", "graduates"],
  ["reptiles", "swimmers", "nocturnal animals"],
  ["ceramics", "exports", "handmade items"],
  ["archivists", "linguists", "volunteers"],
  ["orchards", "protected sites", "wetlands"],
  ["glaciers", "shrinking features", "monitored sites"],
  ["potters", "tutors", "islanders"],
  ["ferries", "diesel vessels", "licensed craft"],
  ["mosses", "shade plants", "protected species"],
  ["auditors", "statisticians", "board members"],
  ["quarries", "restored sites", "public land"],
  ["bakeries", "family businesses", "exporters"],
  ["telescopes", "donated instruments", "working devices"],
];

const syllogismGenerator: QuestionGenerator = {
  id: "logic.syllogism",
  category: "deductive-logic",
  supportedDifficulties: [3, 4, 5, 6, 7, 8, 9],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    const terms = rng.pick(SYLLOGISM_TERMS);
    const [A, B, C] = terms;

    const quantifiers: Quantifier[] =
      difficulty <= 4 ? ["all", "no", "some"] : ["all", "no", "some", "some-not"];

    // Premises link A-B and B-C; the conclusion links A-C.
    const premises: Proposition[] = [
      { quantifier: rng.pick(quantifiers), subject: A, predicate: B },
      { quantifier: rng.pick(quantifiers), subject: B, predicate: C },
    ];

    // Premises must be jointly satisfiable, otherwise everything follows vacuously.
    let satisfiable = false;
    outer: for (let a = 1; a < SUBSET_COUNT; a += 1) {
      for (let b = 1; b < SUBSET_COUNT; b += 1) {
        for (let c = 1; c < SUBSET_COUNT; c += 1) {
          const assign: Record<string, number> = { [A]: a, [B]: b, [C]: c };
          if (premises.every((p) => holds(p, assign))) {
            satisfiable = true;
            break outer;
          }
        }
      }
    }
    if (!satisfiable) return null;

    // Every candidate conclusion relating A and C, in both directions.
    const allConclusions: Proposition[] = [];
    for (const quantifier of ["all", "no", "some", "some-not"] as const) {
      allConclusions.push({ quantifier, subject: A, predicate: C });
      allConclusions.push({ quantifier, subject: C, predicate: A });
    }

    const valid = allConclusions.filter((c) => isValid(premises, c, terms));
    const invalid = allConclusions.filter((c) => !isValid(premises, c, terms));

    // The item needs exactly one valid conclusion among the options. If the premises support
    // several, picking one would make the other options defensible too.
    if (valid.length !== 1) return null;
    const answer = valid[0];
    if (!answer || invalid.length < 3) return null;

    const optionCount = optionCountFor(difficulty);
    const distractors = rng.sample(invalid, optionCount - 2);

    const choices: GeneratedChoice[] = rng.shuffle([
      {
        text: buildLocalized((l) => propositionText(answer, l)),
        isCorrect: true,
        rationale: L(
          "This conclusion holds in every situation consistent with the premises.",
          "Bu nəticə müqəddimələrə uyğun hər situasiyada doğrudur.",
        ),
      },
      ...distractors.map((d) => ({
        text: buildLocalized((l) => propositionText(d, l)),
        isCorrect: false,
        rationale: L(
          "A situation can be described in which both premises hold but this conclusion is false, so it does not follow.",
          "Hər iki müqəddimənin doğru, bu nəticənin isə yanlış olduğu bir situasiya təsvir etmək olar, deməli o zəruri şəkildə çıxmır.",
        ),
      })),
      {
        text: L("None of the above follows necessarily", "Yuxarıdakıların heç biri zəruri olaraq çıxmır"),
        isCorrect: false,
        rationale: L(
          "One of the listed conclusions does follow necessarily.",
          "Sadalanan nəticələrdən biri zəruri olaraq çıxır.",
        ),
      },
    ]);

    return {
      category: "deductive-logic",
      difficulty,
      stem: buildLocalized((l) => {
        const premiseText = premises.map((pr, i) => `${i + 1}. ${propositionText(pr, l)}.`).join("\n");
        return l === "az"
          ? `Hər iki ifadənin doğru olduğunu fərz edin:\n\n${premiseText}\n\nHansı nəticə zəruri olaraq çıxır?`
          : `Assume both statements are true:\n\n${premiseText}\n\nWhich conclusion follows necessarily?`;
      }),
      choices,
      explanation: buildLocalized((l) =>
        l === "az"
          ? `Yalnız "${propositionText(answer, l)}" hər iki müqəddimənin doğru olduğu hər situasiyada doğrudur. Digər variantların hər biri belə situasiyaların ən azı birində yanlışdır, ona görə heç biri zəruri olaraq çıxmır.`
          : `Only "${propositionText(answer, l)}" is true in every situation where both premises hold. The other options are each false in at least one such situation, so none of them follows necessarily.`,
      ),
      estimatedSeconds: estimateSeconds(difficulty, 40),
      generatorId: syllogismGenerator.id,
      seed: "",
      signature: buildSignature(
        "deductive-syllogism",
        terms.join("|"),
        premises.map((p) => `${p.quantifier}:${p.subject}>${p.predicate}`).join(","),
      ),
    };
  },
};

// ---------------------------------------------------------------------------
// Ordering puzzles
// ---------------------------------------------------------------------------

const ORDER_NAMES = ["Ana", "Ben", "Cleo", "Dev", "Elif", "Farid"] as const;

type OrderConstraint =
  | { kind: "before"; a: string; b: string }
  | { kind: "immediately-before"; a: string; b: string }
  | { kind: "not-position"; a: string; position: number }
  | { kind: "position"; a: string; position: number };

function constraintText(c: OrderConstraint, locale: Locale): string {
  const ord = (n: number) => ordinalWord(n, locale);
  if (locale === "az") {
    const abl = (name: string) => ABLATIVE_AZ[name] ?? `${name}-dən`;
    switch (c.kind) {
      case "before":
        return `${c.a} ${abl(c.b)} əvvəl bitirdi.`;
      case "immediately-before":
        return `${c.a} bilavasitə ${abl(c.b)} əvvəl bitirdi.`;
      case "not-position":
        return `${c.a} ${ord(c.position)} bitirmədi.`;
      case "position":
        return `${c.a} ${ord(c.position)} bitirdi.`;
      default: {
        const exhaustive: never = c;
        throw new Error(`Unhandled constraint: ${String(exhaustive)}`);
      }
    }
  }
  switch (c.kind) {
    case "before":
      return `${c.a} finished somewhere ahead of ${c.b}.`;
    case "immediately-before":
      return `${c.a} finished immediately ahead of ${c.b}.`;
    case "not-position":
      return `${c.a} did not finish ${ord(c.position)}.`;
    case "position":
      return `${c.a} finished ${ord(c.position)}.`;
    default: {
      const exhaustive: never = c;
      throw new Error(`Unhandled constraint: ${String(exhaustive)}`);
    }
  }
}

function satisfies(order: readonly string[], c: OrderConstraint): boolean {
  const indexA = order.indexOf(c.a);
  switch (c.kind) {
    case "before":
      return indexA < order.indexOf(c.b);
    case "immediately-before":
      return order.indexOf(c.b) - indexA === 1;
    case "not-position":
      return indexA !== c.position - 1;
    case "position":
      return indexA === c.position - 1;
    default: {
      const exhaustive: never = c;
      throw new Error(`Unhandled constraint: ${String(exhaustive)}`);
    }
  }
}

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 1) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const perm of permutations(rest)) out.push([items[i] as T, ...perm]);
  }
  return out;
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth"];
function ordinalWord(n: number, locale: Locale): string {
  return locale === "az" ? ORDINAL_AZ[n - 1] ?? `${n}.` : ORDINALS[n - 1] ?? `${n}th`;
}

const orderingGenerator: QuestionGenerator = {
  id: "logic.ordering",
  category: "logical-reasoning",
  supportedDifficulties: [3, 4, 5, 6, 7, 8, 9, 10],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    const count = difficulty <= 4 ? 4 : difficulty <= 8 ? 5 : 6;
    const names = rng.sample(ORDER_NAMES, count);
    const all = permutations(names);

    // Choose a target ordering, then describe it with constraints until it is the only one
    // that fits. Working backwards from a known solution guarantees satisfiability.
    const target = rng.pick(all);

    const pool: OrderConstraint[] = [];
    for (let i = 0; i < count; i += 1) {
      for (let j = 0; j < count; j += 1) {
        if (i === j) continue;
        const a = target[i] as string;
        const b = target[j] as string;
        if (i < j) pool.push({ kind: "before", a, b });
        if (j - i === 1) pool.push({ kind: "immediately-before", a, b });
      }
    }
    for (let i = 0; i < count; i += 1) {
      for (let p = 1; p <= count; p += 1) {
        if (p !== i + 1) pool.push({ kind: "not-position", a: target[i] as string, position: p });
      }
    }

    const shuffledPool = rng.shuffle(pool);
    const chosen: OrderConstraint[] = [];
    let consistent = all;

    for (const constraint of shuffledPool) {
      if (consistent.length === 1) break;
      const next = consistent.filter((order) => satisfies(order, constraint));
      // Keep only constraints that actually narrow the field; redundant clues make the puzzle
      // wordy without making it harder.
      if (next.length === consistent.length || next.length === 0) continue;
      chosen.push(constraint);
      consistent = next;
      // The cap must scale with the puzzle: 6 runners means 720 permutations, and a fixed
      // budget of 6 clues frequently cannot narrow that to a unique ordering, so the generator
      // would reject every hard item it tried to build.
      if (chosen.length >= count + 3) break;
    }

    if (consistent.length !== 1) return null;
    const solution = consistent[0];
    if (!solution) return null;

    // Easier items ask about an end position; harder ones ask about the middle.
    const askIndex = difficulty <= 5 ? rng.pick([0, count - 1]) : rng.int(1, count - 2);
    const answerName = solution[askIndex] as string;

    const optionCount = Math.min(optionCountFor(difficulty), count);
    const others = names.filter((n) => n !== answerName);
    const distractors = rng.sample(others, optionCount - 1);

    const choices: GeneratedChoice[] = rng.shuffle([
      {
        text: L(answerName, answerName),
        isCorrect: true,
        rationale: L(
          "The only ordering consistent with all the clues puts this person here.",
          "Bütün ipuclarına uyğun gələn yeganə sıralama bu şəxsi bura yerləşdirir.",
        ),
      },
      ...distractors.map((name) => ({
        text: L(name, name),
        isCorrect: false,
        rationale: buildLocalized((l) =>
          l === "az"
            ? `${name} ${ordinalWord(askIndex + 1, "az")} olsaydı, ən azı bir ipucu pozulardı.`
            : `Placing ${name} ${ordinalWord(askIndex + 1, "en")} contradicts at least one clue.`,
        ),
      })),
    ]);

    return {
      category: "logical-reasoning",
      difficulty,
      stem: buildLocalized((l) => {
        const clueText = chosen.map((c, i) => `${i + 1}. ${constraintText(c, l)}`).join("\n");
        return l === "az"
          ? `${count} qaçışçı yarışı bitirdi. Yalnız bu faktlardan istifadə edərək:\n\n${clueText}\n\n${ordinalWord(askIndex + 1, "az")} yeri kim tutdu?`
          : `${count} runners finished a race. Using only these facts:\n\n${clueText}\n\nWho finished ${ordinalWord(askIndex + 1, "en")}?`;
      }),
      choices,
      explanation: buildLocalized((l) =>
        l === "az"
          ? `İpucları yalnız bir sıralamaya imkan verir: ${solution.join(" → ")}. Bu sıralamada ${answerName} ${ordinalWord(askIndex + 1, "az")} bitirir.`
          : `The clues admit exactly one ordering: ${solution.join(" → ")}. That places ${answerName} ${ordinalWord(askIndex + 1, "en")}.`,
      ),
      estimatedSeconds: estimateSeconds(difficulty, 45),
      generatorId: orderingGenerator.id,
      seed: "",
      signature: buildSignature(
        "logical-ordering",
        names.join("|"),
        chosen.map((c) => JSON.stringify(c)).join(","),
      ),
    };
  },
};

// ---------------------------------------------------------------------------
// Knights and knaves
// ---------------------------------------------------------------------------

const ISLANDERS = ["Ari", "Bo", "Cass", "Dara"] as const;

/** A statement is a predicate over the truth assignment (true = knight). */
interface Statement {
  speaker: number;
  /** Localized statement text. English is the stable form used for the item signature. */
  text: (names: readonly string[]) => LocalizedString;
  evaluate: (assignment: readonly boolean[]) => boolean;
}

const knightsGenerator: QuestionGenerator = {
  id: "logic.knights",
  category: "deductive-logic",
  supportedDifficulties: [4, 5, 6, 7, 8, 9, 10],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    const count = difficulty <= 6 ? 2 : 3;
    const names = rng.sample(ISLANDERS, count);

    const templates: ((speaker: number) => Statement)[] = [
      (speaker) => {
        const other = (speaker + 1) % count;
        return {
          speaker,
          text: (n) => L(`${n[other]} is a knave.`, `${n[other]} yalançıdır.`),
          evaluate: (a) => a[other] === false,
        };
      },
      (speaker) => {
        const other = (speaker + 1) % count;
        return {
          speaker,
          text: (n) => L(`${n[other]} is a knight.`, `${n[other]} cəngavərdir.`),
          evaluate: (a) => a[other] === true,
        };
      },
      (speaker) => ({
        speaker,
        text: () => L(`At least one of us is a knave.`, `Ən azı birimiz yalançıdır.`),
        evaluate: (a) => a.some((v) => v === false),
      }),
      (speaker) => ({
        speaker,
        text: () => L(`We are all knights.`, `Hamımız cəngavərik.`),
        evaluate: (a) => a.every((v) => v === true),
      }),
      (speaker) => {
        const other = (speaker + 1) % count;
        return {
          speaker,
          text: (n) => L(`${n[other]} and I are of the same type.`, `${n[other]} və mən eyni növdənik.`),
          evaluate: (a) => a[speaker] === a[other],
        };
      },
      (speaker) => {
        const other = (speaker + 1) % count;
        return {
          speaker,
          text: (n) => L(`${n[other]} and I are of different types.`, `${n[other]} və mən fərqli növdənik.`),
          evaluate: (a) => a[speaker] !== a[other],
        };
      },
    ];

    const statements: Statement[] = [];
    for (let speaker = 0; speaker < count; speaker += 1) {
      statements.push(rng.pick(templates)(speaker));
    }

    // A knight's statement is true; a knave's is false. Enumerate all assignments.
    const consistent: boolean[][] = [];
    for (let mask = 0; mask < 1 << count; mask += 1) {
      const assignment = Array.from({ length: count }, (_, i) => (mask & (1 << i)) !== 0);
      const ok = statements.every((s) => {
        const isKnight = assignment[s.speaker] === true;
        return s.evaluate(assignment) === isKnight;
      });
      if (ok) consistent.push(assignment);
    }

    // Puzzles with zero or multiple solutions are unusable.
    if (consistent.length !== 1) return null;
    const solution = consistent[0];
    if (!solution) return null;

    // Describe a knight-set (subset of names) in a given locale.
    const knightSet = (subset: readonly string[], locale: Locale): string => {
      if (locale === "az") {
        return subset.length === 0
          ? "Heç biri cəngavər deyil"
          : subset.length === count
            ? "Hamısı cəngavərdir"
            : `Yalnız ${formatList(subset, "az")}`;
      }
      return subset.length === 0
        ? "None of them is a knight"
        : subset.length === count
          ? "All of them are knights"
          : `Only ${formatList(subset, "en")}`;
    };

    const knightNames = names.filter((_, i) => solution[i] === true);
    const answerKey = knightNames.join("|");

    // Options are every possible knight-set, so exactly one is correct by construction.
    const optionSubsets: string[][] = [];
    for (let mask = 0; mask < 1 << count; mask += 1) {
      optionSubsets.push(names.filter((_, i) => (mask & (1 << i)) !== 0));
    }

    const wrong = optionSubsets.filter((s) => s.join("|") !== answerKey);
    const optionCount = Math.min(optionCountFor(difficulty), wrong.length + 1);
    const distractors = rng.sample(wrong, optionCount - 1);

    const choices: GeneratedChoice[] = rng.shuffle([
      {
        text: buildLocalized((l) => knightSet(knightNames, l)),
        isCorrect: true,
        rationale: L(
          "This is the only assignment under which every statement has the right truth value.",
          "Bu, hər ifadənin düzgün doğruluq dəyərinə malik olduğu yeganə bölgüdür.",
        ),
      },
      ...distractors.map((subset) => ({
        text: buildLocalized((l) => knightSet(subset, l)),
        isCorrect: false,
        rationale: L(
          "Under this assignment at least one islander's statement contradicts their type.",
          "Bu bölgüdə ən azı bir ada sakininin ifadəsi onun növü ilə ziddiyyət təşkil edir.",
        ),
      })),
    ]);

    return {
      category: "deductive-logic",
      difficulty,
      stem: buildLocalized((l) => {
        const said = statements
          .map((s) => `${names[s.speaker]} ${l === "az" ? "deyir" : "says"}: "${(s.text(names) as { en: string; az?: string })[l] ?? s.text(names).en}"`)
          .join("\n");
        return l === "az"
          ? `Bir adada cəngavərlər həmişə doğru danışır, yalançılar isə həmişə yalan danışır. Hər sakin ya biri, ya da digəridir.\n\n${said}\n\nKim cəngavərdir?`
          : `On an island, knights always tell the truth and knaves always lie. Every inhabitant is one or the other.\n\n${said}\n\nWho is a knight?`;
      }),
      choices,
      explanation: buildLocalized((l) =>
        l === "az"
          ? `Bütün ${1 << count} ehtimalı yoxlasaq, yalnız biri uyğun gəlir: ${names.map((n, i) => `${n} ${solution[i] ? "cəngavərdir" : "yalançıdır"}`).join(", ")}. Hər digər bölgü kiminsə ifadəsini onun növü ilə ziddiyyətə salır.`
          : `Checking all ${1 << count} possibilities leaves exactly one that is consistent: ${names.map((n, i) => `${n} is a ${solution[i] ? "knight" : "knave"}`).join(", ")}. Any other assignment makes someone's statement disagree with their type.`,
      ),
      estimatedSeconds: estimateSeconds(difficulty, 48),
      generatorId: knightsGenerator.id,
      seed: "",
      signature: buildSignature(
        "deductive-knights",
        names.join("|"),
        statements.map((s) => s.text(names).en).join(";"),
      ),
    };
  },
};

function formatList(items: readonly string[], locale: Locale): string {
  if (items.length === 1) return items[0] as string;
  const conj = locale === "az" ? "və" : "and";
  return `${items.slice(0, -1).join(", ")} ${conj} ${items[items.length - 1]}`;
}

// ---------------------------------------------------------------------------
// Conditional reasoning
// ---------------------------------------------------------------------------

interface Conditional {
  p: string;
  q: string;
  /** Azerbaijani nominalised event phrases ("the triggering of the alarm"), so the invariant
   *  frames "… baş verdi / baş vermədi" (… happened / did not happen) read grammatically. */
  pAz: string;
  qAz: string;
}

const CONDITIONALS: readonly Conditional[] = [
  { p: "the alarm is triggered", q: "the doors lock automatically", pAz: "həyəcan siqnalının işə düşməsi", qAz: "qapıların avtomatik kilidlənməsi" },
  { p: "a book is overdue", q: "a reminder is emailed", pAz: "kitabın vaxtının keçməsi", qAz: "xatırlatmanın e-poçtla göndərilməsi" },
  { p: "the sensor detects frost", q: "the heater switches on", pAz: "sensorun şaxtanı aşkarlaması", qAz: "qızdırıcının işə düşməsi" },
  { p: "a parcel is over 5 kg", q: "it ships by freight", pAz: "bağlamanın 5 kq-dan ağır olması", qAz: "onun yük daşıması ilə göndərilməsi" },
  { p: "the pond freezes", q: "the pump shuts down", pAz: "gölməçənin donması", qAz: "nasosun dayanması" },
  { p: "a form is incomplete", q: "it is returned to the sender", pAz: "formanın natamam olması", qAz: "onun göndərənə qaytarılması" },
  { p: "the tide rises above the marker", q: "the harbour gates close", pAz: "qabarmanın nişandan yuxarı qalxması", qAz: "liman qapılarının bağlanması" },
  { p: "a sample fails inspection", q: "the batch is quarantined", pAz: "nümunənin yoxlamada uğursuz olması", qAz: "partiyanın karantinə alınması" },
  { p: "the server loses power", q: "the backup generator starts", pAz: "serverin enerjisini itirməsi", qAz: "ehtiyat generatorun işə düşməsi" },
  { p: "a train is delayed by an hour", q: "passengers are refunded", pAz: "qatarın bir saat gecikməsi", qAz: "sərnişinlərə pulun qaytarılması" },
  { p: "the humidity exceeds 70 per cent", q: "the vents open", pAz: "rütubətin 70 faizi keçməsi", qAz: "havalandırmanın açılması" },
  { p: "a permit expires", q: "the site is closed to visitors", pAz: "icazənin vaxtının bitməsi", qAz: "ərazinin ziyarətçilər üçün bağlanması" },
  { p: "the river level drops below the intake", q: "the mill stops grinding", pAz: "çayın səviyyəsinin su alma nöqtəsindən aşağı düşməsi", qAz: "dəyirmanın üyütməyi dayandırması" },
  { p: "a manuscript exceeds the page limit", q: "it is sent back for revision", pAz: "əlyazmanın səhifə həddini aşması", qAz: "onun düzəliş üçün geri göndərilməsi" },
  { p: "the kiln reaches 900 degrees", q: "the timer begins", pAz: "sobanın 900 dərəcəyə çatması", qAz: "taymerin başlaması" },
  { p: "a bee colony loses its queen", q: "the workers raise a replacement", pAz: "arı ailəsinin ana arısını itirməsi", qAz: "işçilərin əvəzedici yetişdirməsi" },
];

/**
 * The four classical forms. Two are valid; two are the fallacies almost everyone finds
 * tempting — which is exactly what makes them excellent distractors.
 */
const conditionalGenerator: QuestionGenerator = {
  id: "logic.conditional",
  category: "logical-reasoning",
  supportedDifficulties: [2, 3, 4, 5, 6, 7],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    const cond = rng.pick(CONDITIONALS);
    const { p, q, pAz, qAz } = cond;
    const useModusTollens = difficulty >= 4;

    // Localised event statements: "X happened / did not happen" and their Azerbaijani equivalents
    // built from the nominalised event phrases.
    const happened = (en: string, az: string) =>
      L(`${capitalise(en)} happened.`, `${capitalise(az)} baş verdi.`);
    const notHappened = (en: string, az: string) =>
      L(`${capitalise(en)} did not happen.`, `${capitalise(az)} baş vermədi.`);

    const options: GeneratedChoice[] = [
      {
        text: useModusTollens ? notHappened(p, pAz) : happened(q, qAz),
        isCorrect: true,
        rationale: useModusTollens
          ? L(
              "Modus tollens: if the consequent is false, the antecedent must be false.",
              "Modus tollens: nəticə yanlışdırsa, şərt də yanlış olmalıdır.",
            )
          : L(
              "Modus ponens: the antecedent holds, so the consequent must hold.",
              "Modus ponens: şərt doğrudursa, nəticə də doğru olmalıdır.",
            ),
      },
      {
        text: useModusTollens ? happened(q, qAz) : notHappened(p, pAz),
        isCorrect: false,
        rationale: L("This contradicts the second statement.", "Bu, ikinci ifadə ilə ziddiyyət təşkil edir."),
      },
      {
        text: useModusTollens ? happened(p, pAz) : notHappened(q, qAz),
        isCorrect: false,
        rationale: L(
          "This is the opposite of what the two statements together imply.",
          "Bu, iki ifadənin birlikdə nəzərdə tutduğunun əksidir.",
        ),
      },
      {
        text: L("Nothing can be concluded.", "Heç bir nəticə çıxarmaq olmaz."),
        isCorrect: false,
        rationale: useModusTollens
          ? L(
              "A conclusion does follow: denying the consequent denies the antecedent.",
              "Nəticə çıxır: nəticəni inkar etmək şərti də inkar edir.",
            )
          : L(
              "A conclusion does follow: affirming the antecedent affirms the consequent.",
              "Nəticə çıxır: şərti təsdiq etmək nəticəni də təsdiq edir.",
            ),
      },
    ];

    // Harder items get a fifth option — the converse, the most commonly accepted invalid inference.
    if (optionCountFor(difficulty) === 5) {
      options.push({
        text: L(
          `Whenever ${q}, ${p} must have happened.`,
          `Hər dəfə ${qAz} baş verəndə, ${pAz} da baş vermiş olmalıdır.`,
        ),
        isCorrect: false,
        rationale: L(
          "This asserts the converse. The rule says the antecedent guarantees the consequent, not that the consequent guarantees the antecedent — the consequent may have other causes.",
          "Bu, tərsini iddia edir. Qayda deyir ki, şərt nəticəyə zəmanət verir, nəticə isə şərtə zəmanət vermir — nəticənin başqa səbəbləri ola bilər.",
        ),
      });
    }

    const choices: GeneratedChoice[] = rng.shuffle(options);

    return {
      category: "logical-reasoning",
      difficulty,
      stem: buildLocalized((l) => {
        const premise2 = useModusTollens
          ? (l === "az" ? `${capitalise(qAz)} baş vermədi.` : `${capitalise(q)} did not happen.`)
          : (l === "az" ? `${capitalise(pAz)} baş verdi.` : `${capitalise(p)}.`);
        return l === "az"
          ? `Hər iki ifadənin doğru olduğunu fərz edin:\n\n1. Əgər ${pAz} baş verirsə, onda ${qAz} baş verir.\n2. ${premise2}\n\nNə nəticə çıxır?`
          : `Assume both statements are true:\n\n1. If ${p}, then ${q}.\n2. ${premise2}\n\nWhat follows?`;
      }),
      choices,
      explanation: buildLocalized((l) =>
        useModusTollens
          ? (l === "az"
              ? `Qayda deyir: ${pAz} baş verərsə, ${qAz} baş verir. ${capitalise(qAz)} baş vermədiyi üçün ${pAz} da baş verə bilməzdi — əks halda qayda pozulardı. (Diqqət: tərsi doğru deyil: ${qAz} başqa səbəblərdən baş verə bilər.)`
              : `The rule says ${p} guarantees ${q}. Since ${q} did not happen, ${p} cannot have happened either — otherwise the rule would have been broken. (Note the reverse does not hold: ${q} could happen for other reasons.)`)
          : (l === "az"
              ? `Qayda deyir: ${pAz} baş verərsə, ${qAz} baş verir. ${capitalise(pAz)} baş verdiyi üçün ${qAz} da baş verməlidir.`
              : `The rule says ${p} guarantees ${q}. Since ${p} happened, ${q} must follow.`),
      ),
      estimatedSeconds: estimateSeconds(difficulty, 30),
      generatorId: conditionalGenerator.id,
      seed: "",
      signature: buildSignature("logical-conditional", p, q, useModusTollens ? "MT" : "MP"),
    };
  },
};

function capitalise(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

export const logicGenerators: readonly QuestionGenerator[] = [
  syllogismGenerator,
  orderingGenerator,
  knightsGenerator,
  conditionalGenerator,
];
