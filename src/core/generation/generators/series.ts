/**
 * Numeric generators: number series and quantitative reasoning.
 *
 * Each series rule is a closed-form or recurrence definition plus a solver. The answer is always
 * produced by *running the rule one more step*, never by authoring a value, so an item cannot
 * disagree with its own key.
 *
 * Distractors come from named arithmetic slips (reused the previous difference, applied the
 * operation an extra time, got the sign backwards) rather than random offsets — a random number
 * is instantly dismissible and measures nothing.
 */

import type { Difficulty, GeneratedItem, QuestionGenerator, Rng } from "../../types";
import { buildChoices, estimateSeconds, optionCountFor } from "../choices";
import type { DistractorCandidate } from "../choices";
import { buildSignature } from "../signature";
import { L, localize, type Locale, type LocalizedString } from "../../i18n";
import { buildLocalized } from "../i18n-helpers";

// ---------------------------------------------------------------------------
// Number series
// ---------------------------------------------------------------------------

interface SeriesRule {
  kind: string;
  /** Terms shown to the test-taker plus the answer as the final element. */
  terms: number[];
  explanation: LocalizedString;
  /** Distractors specific to this rule's characteristic errors. */
  distractors: DistractorCandidate<number>[];
}

/** Arithmetic: constant difference. */
function arithmetic(rng: Rng, length: number, hard: boolean): SeriesRule {
  const d = hard ? rng.pick([7, 9, 11, 12, 13, 15]) : rng.pick([2, 3, 4, 5, 6]);
  const sign = rng.chance(hard ? 0.4 : 0.15) ? -1 : 1;
  const start = rng.int(hard ? 20 : 1, hard ? 90 : 25);
  const terms = Array.from({ length }, (_, i) => start + sign * d * i);
  const answer = terms[length - 1] as number;
  const prev = terms[length - 2] as number;

  return {
    kind: "arithmetic",
    terms,
    explanation: L(
      `Each term ${sign > 0 ? "increases" : "decreases"} by ${d}.`,
      `Hər üzv ${d} qədər ${sign > 0 ? "artır" : "azalır"}.`,
    ),
    distractors: [
      { value: answer + sign * d, rationale: L("Continued one term too far.", "Bir üzv artıq davam etdirib.") },
      { value: prev, rationale: L("Repeated the previous term instead of adding the difference.", "Fərqi toplamaq əvəzinə əvvəlki üzvü təkrarlayıb.") },
      { value: answer - sign, rationale: L("Arithmetic slip of one.", "Bir vahidlik hesab səhvi.") },
      { value: prev - sign * d, rationale: L("Applied the difference in the wrong direction.", "Fərqi yanlış istiqamətdə tətbiq edib.") },
    ],
  };
}

/** Geometric: constant ratio. */
function geometric(rng: Rng, length: number, hard: boolean): SeriesRule {
  const r = hard ? rng.pick([3, 4]) : rng.pick([2, 3]);
  const start = rng.int(1, hard ? 6 : 4);
  const terms = Array.from({ length }, (_, i) => start * r ** i);
  const answer = terms[length - 1] as number;
  const prev = terms[length - 2] as number;

  return {
    kind: "geometric",
    terms,
    explanation: L(
      `Each term is the previous term multiplied by ${r}.`,
      `Hər üzv əvvəlki üzvün ${r}-ə vurulması ilə alınır.`,
    ),
    distractors: [
      { value: answer * r, rationale: L("Multiplied one time too many.", "Bir dəfə artıq vurub.") },
      { value: prev + r, rationale: L("Added the ratio instead of multiplying by it.", "Əmsala vurmaq əvəzinə onu toplayıb.") },
      { value: prev * (r + 1), rationale: L("Used the wrong ratio.", "Yanlış əmsaldan istifadə edib.") },
      { value: answer - prev, rationale: L("Subtracted rather than continued the progression.", "Ardıcıllığı davam etdirmək əvəzinə çıxıb.") },
    ],
  };
}

/** Alternating: two different operations applied in turn. */
function alternating(rng: Rng, length: number): SeriesRule {
  const up = rng.int(4, 12);
  const down = rng.int(1, 3);
  const start = rng.int(5, 30);
  const terms: number[] = [start];
  for (let i = 1; i < length; i += 1) {
    const prev = terms[i - 1] as number;
    terms.push(i % 2 === 1 ? prev + up : prev - down);
  }
  const answer = terms[length - 1] as number;
  const prev = terms[length - 2] as number;

  return {
    kind: "alternating",
    terms,
    explanation: L(
      `The series alternates: add ${up}, then subtract ${down}.`,
      `Ardıcıllıq növbələşir: ${up} əlavə et, sonra ${down} çıx.`,
    ),
    distractors: [
      { value: prev + up, rationale: L("Applied the addition step when the subtraction step was due.", "Çıxma addımı növbədə olanda toplama addımını tətbiq edib.") },
      { value: prev - down - down, rationale: L("Applied the subtraction twice.", "Çıxmanı iki dəfə tətbiq edib.") },
      { value: answer + 1, rationale: L("Arithmetic slip of one.", "Bir vahidlik hesab səhvi.") },
      { value: prev + up - down, rationale: L("Applied both steps at once.", "Hər iki addımı eyni anda tətbiq edib.") },
    ],
  };
}

/** Second-difference: the differences themselves form an arithmetic progression. */
function quadratic(rng: Rng, length: number): SeriesRule {
  const firstDiff = rng.int(2, 6);
  const secondDiff = rng.int(1, 4);
  const start = rng.int(1, 12);
  const terms: number[] = [start];
  let diff = firstDiff;
  for (let i = 1; i < length; i += 1) {
    terms.push((terms[i - 1] as number) + diff);
    diff += secondDiff;
  }
  const answer = terms[length - 1] as number;
  const prev = terms[length - 2] as number;
  const lastDiff = answer - prev;

  return {
    kind: "quadratic",
    terms,
    explanation: L(
      `The gaps between terms are not constant — they grow by ${secondDiff} each time ` +
        `(${firstDiff}, ${firstDiff + secondDiff}, ${firstDiff + 2 * secondDiff}, …). ` +
        `The final gap is ${lastDiff}.`,
      `Üzvlər arasındakı fərqlər sabit deyil — hər dəfə ${secondDiff} qədər artır ` +
        `(${firstDiff}, ${firstDiff + secondDiff}, ${firstDiff + 2 * secondDiff}, …). ` +
        `Sonuncu fərq ${lastDiff}-dir.`,
    ),
    distractors: [
      {
        value: prev + lastDiff - secondDiff,
        rationale: L("Reused the previous gap instead of growing it.", "Fərqi artırmaq əvəzinə əvvəlki fərqi təkrar işlədib."),
      },
      { value: prev + lastDiff + secondDiff, rationale: L("Grew the gap one step too far.", "Fərqi bir addım artıq böyüdüb.") },
      { value: answer + secondDiff, rationale: L("Added the second difference twice.", "İkinci fərqi iki dəfə toplayıb.") },
      { value: prev * 2, rationale: L("Assumed the series doubles.", "Ardıcıllığın ikiqat artdığını düşünüb.") },
    ],
  };
}

/** Fibonacci-like: each term is the sum of the two before it. */
function fibonacciLike(rng: Rng, length: number): SeriesRule {
  const a = rng.int(1, 6);
  const b = rng.int(2, 9);
  const terms: number[] = [a, b];
  for (let i = 2; i < length; i += 1) {
    terms.push((terms[i - 1] as number) + (terms[i - 2] as number));
  }
  const answer = terms[length - 1] as number;
  const prev = terms[length - 2] as number;
  const prev2 = terms[length - 3] as number;

  return {
    kind: "fibonacci",
    terms,
    explanation: L(
      `Each term is the sum of the two preceding terms (${prev2} + ${prev} = ${answer}).`,
      `Hər üzv özündən əvvəlki iki üzvün cəmidir (${prev2} + ${prev} = ${answer}).`,
    ),
    distractors: [
      { value: prev * 2, rationale: L("Doubled the last term instead of summing the last two.", "Son iki üzvü toplamaq əvəzinə sonuncunu ikiqat artırıb.") },
      { value: prev - prev2, rationale: L("Subtracted the two preceding terms.", "Əvvəlki iki üzvü çıxıb.") },
      { value: answer + prev, rationale: L("Continued one term too far.", "Bir üzv artıq davam etdirib.") },
      { value: prev + prev2 + 1, rationale: L("Arithmetic slip of one.", "Bir vahidlik hesab səhvi.") },
    ],
  };
}

/** Multiply then add — a composite recurrence. */
function multiplyAdd(rng: Rng, length: number): SeriesRule {
  const r = rng.pick([2, 3]);
  const c = rng.int(1, 7);
  const start = rng.int(1, 5);
  const terms: number[] = [start];
  for (let i = 1; i < length; i += 1) terms.push((terms[i - 1] as number) * r + c);
  const answer = terms[length - 1] as number;
  const prev = terms[length - 2] as number;

  return {
    kind: "multiply-add",
    terms,
    explanation: L(
      `Each term is the previous term multiplied by ${r}, plus ${c} (${prev} × ${r} + ${c} = ${answer}).`,
      `Hər üzv əvvəlki üzvün ${r}-ə vurulub üstünə ${c} əlavə edilməsidir (${prev} × ${r} + ${c} = ${answer}).`,
    ),
    distractors: [
      { value: prev * r, rationale: L(`Multiplied by ${r} but forgot to add ${c}.`, `${r}-ə vurub, lakin ${c} əlavə etməyi unudub.`) },
      { value: prev + c, rationale: L(`Added ${c} but forgot to multiply.`, `${c} əlavə edib, lakin vurmağı unudub.`) },
      { value: (prev + c) * r, rationale: L("Added before multiplying instead of after.", "Vurmadan sonra yox, əvvəl toplayıb.") },
      { value: answer * r + c, rationale: L("Continued one term too far.", "Bir üzv artıq davam etdirib.") },
    ],
  };
}

/** Two independent series interleaved — the hardest common family. */
function interleaved(rng: Rng, length: number): SeriesRule {
  const startA = rng.int(2, 15);
  const stepA = rng.int(3, 9);
  const startB = rng.int(40, 90);
  const stepB = rng.int(3, 11);

  const terms: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const index = Math.floor(i / 2);
    terms.push(i % 2 === 0 ? startA + stepA * index : startB - stepB * index);
  }
  const answer = terms[length - 1] as number;

  const isEven = (length - 1) % 2 === 0;
  const prevSame = terms[length - 3] as number;

  return {
    kind: "interleaved",
    terms,
    explanation: L(
      `Two series are interleaved. Terms in odd positions increase by ${stepA}; ` +
        `terms in even positions decrease by ${stepB}. The next term belongs to the ` +
        `${isEven ? "increasing" : "decreasing"} series: ${prevSame} ${isEven ? "+" : "−"} ` +
        `${isEven ? stepA : stepB} = ${answer}.`,
      `İki ardıcıllıq bir-birinə hörülüb. Tək mövqedəki üzvlər ${stepA} qədər artır; ` +
        `cüt mövqedəki üzvlər ${stepB} qədər azalır. Növbəti üzv ` +
        `${isEven ? "artan" : "azalan"} ardıcıllığa aiddir: ${prevSame} ${isEven ? "+" : "−"} ` +
        `${isEven ? stepA : stepB} = ${answer}.`,
    ),
    distractors: [
      {
        value: (terms[length - 2] as number) + (isEven ? stepB : stepA),
        rationale: L("Continued the other interleaved series instead of the correct one.", "Düzgün ardıcıllıq əvəzinə digər hörülmüş ardıcıllığı davam etdirib."),
      },
      { value: prevSame, rationale: L("Repeated the previous term of the same sub-series.", "Eyni alt-ardıcıllığın əvvəlki üzvünü təkrarlayıb.") },
      {
        value: answer + (isEven ? stepA : -stepB),
        rationale: L("Advanced the sub-series one step too far.", "Alt-ardıcıllığı bir addım artıq irəlilədib."),
      },
      {
        value: prevSame - (isEven ? stepA : -stepB),
        rationale: L("Moved the sub-series in the wrong direction.", "Alt-ardıcıllığı yanlış istiqamətdə hərəkət etdirib."),
      },
    ],
  };
}

function seriesRuleFor(rng: Rng, difficulty: Difficulty, length: number): SeriesRule {
  if (difficulty <= 2) return arithmetic(rng, length, false);
  if (difficulty <= 4) return rng.chance(0.5) ? arithmetic(rng, length, true) : geometric(rng, length, false);
  if (difficulty <= 6) {
    return rng.pick([
      () => alternating(rng, length),
      () => quadratic(rng, length),
      () => geometric(rng, length, true),
    ])();
  }
  if (difficulty <= 8) {
    return rng.pick([
      () => fibonacciLike(rng, length),
      () => multiplyAdd(rng, length),
      () => quadratic(rng, length),
    ])();
  }
  return rng.pick([() => interleaved(rng, length), () => multiplyAdd(rng, length)])();
}

const numberSeriesGenerator: QuestionGenerator = {
  id: "series.number",
  category: "number-series",
  supportedDifficulties: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    const length = difficulty <= 4 ? 6 : difficulty <= 8 ? 6 : 7;
    const rule = seriesRuleFor(rng, difficulty, length);

    const answer = rule.terms[rule.terms.length - 1];
    if (answer === undefined) return null;
    const shown = rule.terms.slice(0, -1);

    // Reject anything that would be unpleasant to read or trivially degenerate.
    if (!rule.terms.every((t) => Number.isSafeInteger(t))) return null;
    if (rule.terms.some((t) => Math.abs(t) > 100_000)) return null;
    if (new Set(shown).size < shown.length - 1) return null;

    const choices = buildChoices({
      rng,
      correct: answer,
      correctRationale: rule.explanation,
      candidates: rule.distractors,
      optionCount: optionCountFor(difficulty),
      keyOf: (value) => String(value),
      render: (value) => ({ text: L(String(value), String(value)) }),
      fallback: (attempt) => {
        const delta = (attempt % 2 === 0 ? 1 : -1) * (Math.floor(attempt / 2) + 1);
        return {
          value: answer + delta,
          rationale: L("A near miss produced by a small arithmetic error.", "Kiçik hesab səhvindən yaranan yaxın nəticə."),
        };
      },
    });
    if (!choices) return null;

    const seq = `${shown.join(",  ")},  ?`;
    return {
      category: "number-series",
      difficulty,
      stem: buildLocalized((l) =>
        (l === "az" ? "Bu ardıcıllıqda növbəti ədəd hansıdır?" : "What number comes next in this series?") +
        `\n\n${seq}`,
      ),
      choices,
      explanation: buildLocalized((l) =>
        l === "az"
          ? `${localize(rule.explanation, l)} Növbəti üzv ${answer}.`
          : `${localize(rule.explanation, l)} The next term is ${answer}.`,
      ),
      estimatedSeconds: estimateSeconds(difficulty, 25),
      generatorId: numberSeriesGenerator.id,
      seed: "",
      signature: buildSignature("number-series", rule.kind, rule.terms.join(",")),
    };
  },
};

// ---------------------------------------------------------------------------
// Quantitative reasoning
// ---------------------------------------------------------------------------

interface WordProblem {
  kind: string;
  stem: LocalizedString;
  answer: number;
  explanation: LocalizedString;
  distractors: DistractorCandidate<number>[];
  /** Formats a numeric option for display (adds units), per locale. */
  format: (value: number, locale: Locale) => string;
}

const PEOPLE = ["Maya", "Omar", "Lena", "Priya", "Tomas", "Iris", "Noah", "Ada"] as const;

function percentageProblem(rng: Rng, hard: boolean): WordProblem {
  const base = rng.int(2, 12) * (hard ? 25 : 20);
  const pct = rng.pick(hard ? [15, 35, 45, 65, 85] : [10, 20, 25, 50, 75]);
  const answer = (base * pct) / 100;

  return {
    kind: "percentage",
    stem: L(
      `A shop has ${base} items in stock and sells ${pct}% of them in one day. How many items were sold?`,
      `Mağazada ${base} əşya var və bir gündə onların ${pct}%-i satılır. Neçə əşya satılıb?`,
    ),
    answer,
    explanation: L(
      `${pct}% of ${base} is ${base} × ${pct}/100 = ${answer}.`,
      `${base}-in ${pct}%-i: ${base} × ${pct}/100 = ${answer}.`,
    ),
    distractors: [
      { value: base - answer, rationale: L("Calculated the percentage remaining instead of the percentage sold.", "Satılan faiz əvəzinə qalan faizi hesablayıb.") },
      { value: Math.round(base / pct), rationale: L("Divided by the percentage instead of multiplying by it.", "Faizə vurmaq əvəzinə ona bölüb.") },
      { value: Math.round((base * pct) / 10), rationale: L("Divided by 10 rather than 100.", "100-ə yox, 10-a bölüb.") },
      { value: answer + pct, rationale: L("Added the percentage to the result.", "Faizi nəticəyə əlavə edib.") },
    ],
    format: (v) => String(v),
  };
}

function ratioProblem(rng: Rng, hard: boolean): WordProblem {
  const a = rng.int(2, hard ? 9 : 5);
  const b = rng.int(2, hard ? 9 : 5);
  const unit = rng.int(3, hard ? 15 : 9);
  const total = (a + b) * unit;
  const answer = a * unit;
  const [x, y] = [rng.pick(PEOPLE), rng.pick(PEOPLE.filter((p) => p !== PEOPLE[0]))];

  return {
    kind: "ratio",
    stem: L(
      `${x} and ${y} share ${total} tokens in the ratio ${a} : ${b}. How many tokens does ${x} receive?`,
      `${x} və ${y} ${total} jetonu ${a} : ${b} nisbətində bölüşür. ${x} neçə jeton alır?`,
    ),
    answer,
    explanation: L(
      `The ratio has ${a} + ${b} = ${a + b} parts, so one part is ${total} ÷ ${a + b} = ${unit}. ` +
        `${x} receives ${a} parts: ${a} × ${unit} = ${answer}.`,
      `Nisbətdə ${a} + ${b} = ${a + b} hissə var, deməli bir hissə ${total} ÷ ${a + b} = ${unit}-dir. ` +
        `${x} ${a} hissə alır: ${a} × ${unit} = ${answer}.`,
    ),
    distractors: [
      { value: b * unit, rationale: L(`Gave ${x} the other share of the ratio.`, `${x}-ə nisbətin digər payını verib.`) },
      { value: Math.round(total / 2), rationale: L("Split the total evenly, ignoring the ratio.", "Nisbəti nəzərə almadan cəmi bərabər bölüb.") },
      { value: unit, rationale: L("Stopped at the value of a single part.", "Bir hissənin dəyərində dayanıb.") },
      { value: total - answer - unit, rationale: L("Subtracted an extra part when finding the remainder.", "Qalığı taparkən bir hissə artıq çıxıb.") },
    ],
    format: (v) => String(v),
  };
}

function rateProblem(rng: Rng, hard: boolean): WordProblem {
  const speed = rng.pick(hard ? [45, 55, 65, 75] : [30, 40, 50, 60]);
  const hours = rng.pick(hard ? [3, 4, 6] : [2, 3, 4]);
  const answer = speed * hours;

  return {
    kind: "rate",
    stem: L(
      `A train travels at a constant ${speed} km/h. How far does it travel in ${hours} hours?`,
      `Qatar sabit ${speed} km/saat sürətlə hərəkət edir. ${hours} saatda nə qədər məsafə qət edir?`,
    ),
    answer,
    explanation: L(
      `Distance = speed × time = ${speed} × ${hours} = ${answer} km.`,
      `Məsafə = sürət × zaman = ${speed} × ${hours} = ${answer} km.`,
    ),
    distractors: [
      { value: Math.round(speed / hours), rationale: L("Divided speed by time instead of multiplying.", "Vurmaq əvəzinə sürəti zamana bölüb.") },
      { value: speed + hours, rationale: L("Added the two quantities.", "İki kəmiyyəti toplayıb.") },
      { value: speed * (hours + 1), rationale: L("Used one hour too many.", "Bir saat artıq götürüb.") },
      { value: speed * (hours - 1), rationale: L("Used one hour too few.", "Bir saat az götürüb.") },
    ],
    format: (v) => `${v} km`,
  };
}

function workRateProblem(rng: Rng): WordProblem {
  const workers = rng.int(2, 6);
  const days = rng.int(4, 12);
  const newWorkers = workers * rng.pick([2, 3]);
  const answer = (workers * days) / newWorkers;
  const totalWork = workers * days;

  return {
    kind: "work-rate",
    stem: L(
      `${workers} identical machines complete a job in ${days} days. ` +
        `Working at the same rate, how many days would ${newWorkers} machines take?`,
      `${workers} eyni maşın bir işi ${days} günə tamamlayır. ` +
        `Eyni sürətlə işləyərək ${newWorkers} maşın neçə günə tamamlayardı?`,
    ),
    answer,
    explanation: L(
      `The job takes ${workers} × ${days} = ${totalWork} machine-days. ` +
        `With ${newWorkers} machines: ${totalWork} ÷ ${newWorkers} = ${answer} days.`,
      `İş ${workers} × ${days} = ${totalWork} maşın-gün tələb edir. ` +
        `${newWorkers} maşınla: ${totalWork} ÷ ${newWorkers} = ${answer} gün.`,
    ),
    distractors: [
      { value: days * (newWorkers / workers), rationale: L("Scaled the time up instead of down — more machines means fewer days.", "Zamanı azaltmaq əvəzinə artırıb — daha çox maşın az gün deməkdir.") },
      { value: days, rationale: L("Assumed the number of machines does not affect the time.", "Maşın sayının zamana təsir etmədiyini düşünüb.") },
      { value: days - newWorkers, rationale: L("Subtracted the machine count from the days.", "Maşın sayını günlərdən çıxıb.") },
      { value: Math.round(totalWork / (newWorkers + 1)), rationale: L("Used the wrong number of machines.", "Yanlış maşın sayından istifadə edib.") },
    ],
    format: (v, l) => `${v} ${l === "az" ? "gün" : "days"}`,
  };
}

function averageProblem(rng: Rng, hard: boolean): WordProblem {
  const count = rng.int(hard ? 5 : 3, hard ? 7 : 4);
  const mean = rng.int(hard ? 30 : 10, hard ? 80 : 30);
  const known = Array.from({ length: count - 1 }, () => rng.int(mean - 8, mean + 8));
  const total = mean * count;
  const answer = total - known.reduce((s, v) => s + v, 0);
  const knownSum = known.reduce((s, v) => s + v, 0);

  return {
    kind: "average",
    stem: L(
      `The average of ${count} numbers is ${mean}. ` +
        `${count - 1} of them are ${known.join(", ")}. What is the remaining number?`,
      `${count} ədədin ortası ${mean}-dir. ` +
        `Onlardan ${count - 1}-i belədir: ${known.join(", ")}. Qalan ədəd nədir?`,
    ),
    answer,
    explanation: L(
      `The numbers total ${mean} × ${count} = ${total}. ` +
        `The known values sum to ${knownSum}, so the remaining number is ${total} − ${knownSum} = ${answer}.`,
      `Ədədlərin cəmi ${mean} × ${count} = ${total}-dir. ` +
        `Məlum ədədlərin cəmi ${knownSum}-dir, deməli qalan ədəd ${total} − ${knownSum} = ${answer}.`,
    ),
    distractors: [
      { value: mean, rationale: L("Assumed the missing value equals the average.", "Çatışmayan ədədin ortaya bərabər olduğunu düşünüb.") },
      { value: total - knownSum - mean, rationale: L("Subtracted the average an extra time.", "Ortanı bir dəfə artıq çıxıb.") },
      { value: Math.round(knownSum / (count - 1)), rationale: L("Averaged only the known values.", "Yalnız məlum ədədlərin ortasını götürüb.") },
      { value: answer + count, rationale: L("Confused the count with an offset.", "Ədədlərin sayını sürüşmə ilə qarışdırıb.") },
    ],
    format: (v) => String(v),
  };
}

function linearProblem(rng: Rng, hard: boolean): WordProblem {
  const perItem = rng.int(hard ? 7 : 3, hard ? 19 : 9);
  const fixed = rng.int(hard ? 15 : 5, hard ? 60 : 25);
  const items = rng.int(4, hard ? 14 : 9);
  const answer = perItem * items + fixed;
  const person = rng.pick(PEOPLE);

  return {
    kind: "linear",
    stem: L(
      `A workshop charges a fixed fee of ${fixed} plus ${perItem} per item. ` +
        `${person} orders ${items} items. What is the total cost?`,
      `Emalatxana ${fixed} sabit haqq üstəgəl hər əşya üçün ${perItem} alır. ` +
        `${person} ${items} əşya sifariş edir. Ümumi məbləğ nə qədərdir?`,
    ),
    answer,
    explanation: L(
      `Total = fixed fee + per-item cost × quantity = ${fixed} + ${perItem} × ${items} = ${answer}.`,
      `Ümumi = sabit haqq + hər əşyanın qiyməti × say = ${fixed} + ${perItem} × ${items} = ${answer}.`,
    ),
    distractors: [
      { value: perItem * items, rationale: L("Forgot to add the fixed fee.", "Sabit haqqı əlavə etməyi unudub.") },
      { value: (perItem + fixed) * items, rationale: L("Applied the fixed fee to every item.", "Sabit haqqı hər əşyaya tətbiq edib.") },
      { value: perItem * items + fixed * items, rationale: L("Charged the fixed fee once per item.", "Sabit haqqı hər əşya üçün bir dəfə hesablayıb.") },
      { value: perItem * (items + 1) + fixed, rationale: L("Counted one item too many.", "Bir əşya artıq sayıb.") },
    ],
    format: (v) => String(v),
  };
}

const quantitativeGenerator: QuestionGenerator = {
  id: "series.quantitative",
  category: "quantitative-reasoning",
  supportedDifficulties: [1, 2, 3, 4, 5, 6, 7, 8, 9],

  generate(rng: Rng, difficulty: Difficulty): GeneratedItem | null {
    const hard = difficulty >= 6;
    const problem: WordProblem = (() => {
      if (difficulty <= 2) return rng.pick([() => percentageProblem(rng, false), () => rateProblem(rng, false)])();
      if (difficulty <= 4) {
        return rng.pick([
          () => ratioProblem(rng, false),
          () => averageProblem(rng, false),
          () => linearProblem(rng, false),
        ])();
      }
      if (difficulty <= 6) {
        return rng.pick([
          () => percentageProblem(rng, true),
          () => ratioProblem(rng, true),
          () => linearProblem(rng, true),
        ])();
      }
      return rng.pick([
        () => workRateProblem(rng),
        () => averageProblem(rng, true),
        () => ratioProblem(rng, hard),
      ])();
    })();

    // Word problems must have clean answers; a fractional result would make the options
    // ambiguous to compare.
    if (!Number.isInteger(problem.answer) || problem.answer <= 0) return null;

    const choices = buildChoices({
      rng,
      correct: problem.answer,
      correctRationale: problem.explanation,
      candidates: problem.distractors.filter((d) => Number.isInteger(d.value) && d.value > 0),
      optionCount: optionCountFor(difficulty),
      keyOf: (value) => String(value),
      render: (value) => ({ text: buildLocalized((l) => problem.format(value, l)) }),
      fallback: (attempt) => {
        const delta = (attempt % 2 === 0 ? 1 : -1) * (Math.floor(attempt / 2) + 1) * 2;
        const value = problem.answer + delta;
        return value > 0
          ? { value, rationale: L("A near miss produced by a small arithmetic error.", "Kiçik hesab səhvindən yaranan yaxın nəticə.") }
          : null;
      },
    });
    if (!choices) return null;

    return {
      category: "quantitative-reasoning",
      difficulty,
      stem: problem.stem,
      choices,
      explanation: problem.explanation,
      estimatedSeconds: estimateSeconds(difficulty, 35),
      generatorId: quantitativeGenerator.id,
      seed: "",
      signature: buildSignature("quantitative-reasoning", problem.kind, problem.stem.en),
    };
  },
};

export const seriesGenerators: readonly QuestionGenerator[] = [
  numberSeriesGenerator,
  quantitativeGenerator,
];
