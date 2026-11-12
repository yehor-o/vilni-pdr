/** Random source returning a float in [0, 1). Injectable so logic can be tested deterministically. */
export type Rng = () => number;

export const defaultRng: Rng = Math.random;

/** Small seeded PRNG (mulberry32) for tests and reproducible runs. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], rng: Rng = defaultRng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** `n` distinct items chosen uniformly at random (all of them if fewer). */
export function sample<T>(items: readonly T[], n: number, rng: Rng = defaultRng): T[] {
  return shuffle(items, rng).slice(0, Math.max(0, n));
}
