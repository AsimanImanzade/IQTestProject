import type { Rng } from "../types";

/**
 * Deterministic pseudo-random number generation.
 *
 * Everything random in this application flows through here so that it is reproducible:
 * the question bank is generated from a fixed seed (identical bank on every machine and in CI),
 * and each test attempt stores the seed used to assemble it, so any delivered test can be
 * reconstructed exactly for audit.
 *
 * `Math.random()` must never be used for bank generation or test assembly.
 */

/**
 * cyrb128 — hashes a string into four 32-bit seed words.
 * A good hash matters here: seeds are sequential strings like "bank:matrix:7:41", and a weak
 * hash would make consecutive seeds produce correlated item sequences.
 */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;

  for (let i = 0; i < str.length; i += 1) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);

  return [
    (h1 ^ h2 ^ h3 ^ h4) >>> 0,
    (h2 ^ h1) >>> 0,
    (h3 ^ h1) >>> 0,
    (h4 ^ h1) >>> 0,
  ];
}

/** sfc32 — small, fast, statistically solid 32-bit counter-based PRNG. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  let s0 = a >>> 0;
  let s1 = b >>> 0;
  let s2 = c >>> 0;
  let s3 = d >>> 0;

  return function next(): number {
    s0 >>>= 0;
    s1 >>>= 0;
    s2 >>>= 0;
    s3 >>>= 0;
    let t = (s0 + s1) | 0;
    s0 = s1 ^ (s1 >>> 9);
    s1 = (s2 + (s2 << 3)) | 0;
    s2 = (s2 << 21) | (s2 >>> 11);
    s3 = (s3 + 1) | 0;
    t = (t + s3) | 0;
    s2 = (s2 + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

class SeededRng implements Rng {
  readonly seed: string;
  readonly #next: () => number;

  constructor(seed: string) {
    this.seed = seed;
    const [a, b, c, d] = cyrb128(seed);
    this.#next = sfc32(a, b, c, d);
    // Discard the first few outputs: counter-based generators are weakly mixed immediately
    // after seeding, which would correlate the first value across similar seeds.
    for (let i = 0; i < 12; i += 1) this.#next();
  }

  next(): number {
    return this.#next();
  }

  int(min: number, max: number): number {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new Error(`Rng.int requires integers, received (${min}, ${max})`);
    }
    if (max < min) throw new Error(`Rng.int called with max < min: (${min}, ${max})`);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick called on an empty array");
    const item = items[this.int(0, items.length - 1)];
    // Unreachable given the bounds above, but noUncheckedIndexedAccess requires the narrowing.
    if (item === undefined) throw new Error("Rng.pick produced an out-of-range index");
    return item;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    // Fisher-Yates, descending. Every permutation is equally likely.
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      const a = out[i] as T;
      const b = out[j] as T;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }

  sample<T>(items: readonly T[], count: number): T[] {
    if (count > items.length) {
      throw new Error(`Rng.sample wants ${count} items but only ${items.length} available`);
    }
    if (count < 0) throw new Error(`Rng.sample called with negative count: ${count}`);
    return this.shuffle(items).slice(0, count);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }
}

/** Create a deterministic RNG from a string seed. The same seed always yields the same stream. */
export function createRng(seed: string): Rng & { seed: string } {
  return new SeededRng(seed);
}

/**
 * Derive a child seed from a parent seed plus a label. Used to give each generator its own
 * independent stream without them interfering when one consumes a different number of values.
 */
export function deriveSeed(parent: string, ...parts: (string | number)[]): string {
  return [parent, ...parts].join(":");
}
