import type { AnswerRecord } from '../storage/types';
import { EXAM_MAX_MISTAKES, FALLBACK_BLOCK } from './exam';

export interface ReadinessBlockInput {
  id: string;
  title: string;
  /** Questions the exam draws from this block. */
  count: number;
  ids: readonly string[];
}

export interface ReadinessBlock {
  id: string;
  title: string;
  /** Questions of the block whose last answer was correct. */
  known: number;
  total: number;
  /** known / total, 0..1 (0 for an empty block). */
  share: number;
  /** Questions the exam actually draws from the block (after the fallback). */
  drawn: number;
  /** Expected wrong answers from this block on an exam right now. */
  expectedMistakes: number;
}

export interface Readiness {
  /** Probability of passing an exam right now, 0..1. */
  chance: number;
  known: number;
  total: number;
  /** Questions answered at least once. */
  answered: number;
  blocks: ReadinessBlock[];
  /** Block with the most expected mistakes (null if none expected). */
  weakest: ReadinessBlock | null;
}

/** C(n, k) as a float; fine for the small k used here (k ≤ 20). */
function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}

/**
 * Probabilities of 0..maxK unknown questions among `drawn` distinct questions
 * taken at random from `total`, `unknown` of which are unknown (hypergeometric).
 */
function unknownDistribution(total: number, unknown: number, drawn: number, maxK: number): number[] {
  const all = choose(total, drawn);
  const out: number[] = [];
  for (let k = 0; k <= maxK; k++) out.push(all ? (choose(unknown, k) * choose(total - unknown, drawn - k)) / all : 0);
  return out;
}

/**
 * How ready the learner is for the exam: the chance that an exam drawn like
 * the real one (`count` questions per block, see sampleExamQuestions) has at
 * most EXAM_MAX_MISTAKES questions whose last answer was not correct. Never
 * answered questions count as unknown.
 */
export function readiness(
  pools: readonly ReadinessBlockInput[],
  answers: Readonly<Record<string, AnswerRecord>>,
): Readiness {
  // Same draw sizes as the sampler: a short block gives all it has, the rest comes from the fallback block.
  const drawn = pools.map((p) => Math.min(p.count, p.ids.length));
  const deficit = pools.reduce((n, p, i) => n + p.count - (drawn[i] ?? 0), 0);
  const fb = pools.findIndex((p) => p.id === FALLBACK_BLOCK);
  const fbPool = pools[fb];
  if (fbPool) drawn[fb] = Math.min(fbPool.ids.length, (drawn[fb] ?? 0) + deficit);

  let answered = 0;
  // dist[m] = probability of exactly m mistakes so far (m ≤ EXAM_MAX_MISTAKES).
  let dist = [1, ...Array<number>(EXAM_MAX_MISTAKES).fill(0)];
  const blocks = pools.map((p, i): ReadinessBlock => {
    let known = 0;
    for (const id of p.ids) {
      const a = answers[id];
      if (!a) continue;
      answered += 1;
      if (a.lastCorrect) known += 1;
    }
    const total = p.ids.length;
    const unknown = total - known;
    const n = drawn[i] ?? 0;
    const block = unknownDistribution(total, unknown, n, EXAM_MAX_MISTAKES);
    dist = dist.map((_, m) => {
      let s = 0;
      for (let k = 0; k <= m; k++) s += (dist[m - k] ?? 0) * (block[k] ?? 0);
      return s;
    });
    return {
      id: p.id,
      title: p.title,
      known,
      total,
      share: total ? known / total : 0,
      drawn: n,
      expectedMistakes: total ? (n * unknown) / total : 0,
    };
  });

  const chance = Math.min(1, Math.max(0, dist.reduce((s, x) => s + x, 0)));
  const weakest = blocks.reduce<ReadinessBlock | null>(
    (w, b) => (b.expectedMistakes > 0 && (!w || b.expectedMistakes > w.expectedMistakes) ? b : w),
    null,
  );
  return {
    chance,
    known: blocks.reduce((n, b) => n + b.known, 0),
    total: blocks.reduce((n, b) => n + b.total, 0),
    answered,
    blocks,
    weakest,
  };
}

/** Chance as shown to the user: whole percent, never a misleading 0% or 100%. */
export function formatChance(chance: number): string {
  if (chance <= 0) return '0%';
  if (chance >= 1) return '100%';
  if (chance < 0.01) return 'менше 1%';
  if (chance > 0.99) return 'понад 99%';
  return `${Math.round(chance * 100)}%`;
}
