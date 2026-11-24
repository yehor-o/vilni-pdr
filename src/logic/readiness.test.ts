import { describe, expect, it } from 'vitest';
import type { AnswerRecord } from '../storage/types';
import { sampleExamQuestions } from './exam';
import { seededRng } from './random';
import { formatChance, readiness, type ReadinessBlockInput } from './readiness';

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}-${i}`);

const POOLS: ReadinessBlockInput[] = [
  { id: 'rules', title: 'ПДР', count: 10, ids: ids('r', 400) },
  { id: 'safety', title: 'Безпека', count: 4, ids: ids('s', 100) },
  { id: 'construction', title: 'Будова', count: 4, ids: ids('c', 100) },
  { id: 'firstaid', title: 'Домедична', count: 2, ids: ids('f', 50) },
];

const rec = (lastCorrect: boolean): AnswerRecord => ({
  attempts: 1,
  correctCount: lastCorrect ? 1 : 0,
  lastChoice: 0,
  lastCorrect,
  lastAt: 1,
});

/** Answers where the first `share` of every block is right and, optionally, the rest wrong. */
function answersWithShare(share: number, restWrong = false): Record<string, AnswerRecord> {
  const out: Record<string, AnswerRecord> = {};
  for (const p of POOLS) {
    const k = Math.round(p.ids.length * share);
    p.ids.forEach((id, i) => {
      if (i < k) out[id] = rec(true);
      else if (restWrong) out[id] = rec(false);
    });
  }
  return out;
}

describe('readiness', () => {
  it('is 0 with no answers and 1 when every last answer is right', () => {
    expect(readiness(POOLS, {}).chance).toBe(0);
    const all = readiness(POOLS, answersWithShare(1));
    expect(all.chance).toBeCloseTo(1, 12);
    expect(all.known).toBe(650);
    expect(all.weakest).toBeNull();
  });

  it('gives ≈ 68% when 90% of every block is known (spec test)', () => {
    const r = readiness(POOLS, answersWithShare(0.9));
    expect(r.chance).toBeGreaterThan(0.66);
    expect(r.chance).toBeLessThan(0.7);
  });

  it('treats never answered and wrong last answers the same', () => {
    const unseen = readiness(POOLS, answersWithShare(0.9));
    const wrong = readiness(POOLS, answersWithShare(0.9, true));
    expect(wrong.chance).toBeCloseTo(unseen.chance, 12);
    expect(unseen.answered).toBe(585);
    expect(wrong.answered).toBe(650);
  });

  it('matches a simulation of the real exam sampler', () => {
    const answers = answersWithShare(0.92);
    answers['f-0'] = rec(false); // a wrong answer inside the known part, to break the symmetry
    const rng = seededRng(42);
    const runs = 20000;
    let passed = 0;
    for (let i = 0; i < runs; i++) {
      const mistakes = sampleExamQuestions(POOLS, rng).filter((id) => !answers[id]?.lastCorrect).length;
      if (mistakes <= 2) passed += 1;
    }
    expect(readiness(POOLS, answers).chance).toBeCloseTo(passed / runs, 1);
  });

  it('points to the block with the most expected mistakes', () => {
    const answers = answersWithShare(1);
    for (const id of ids('c', 30)) delete answers[id]; // construction: 70% known
    for (const id of ids('r', 40)) delete answers[id]; // rules: 90% known
    const r = readiness(POOLS, answers);
    // construction 4 × 0.3 = 1.2 expected mistakes, rules 10 × 0.1 = 1.0
    expect(r.weakest?.id).toBe('construction');
    expect(r.blocks.find((b) => b.id === 'construction')?.share).toBeCloseTo(0.7);
  });

  it('draws the shortfall of a small block from the rules block, like the sampler', () => {
    const pools: ReadinessBlockInput[] = [
      { id: 'rules', title: 'ПДР', count: 10, ids: ids('r', 50) },
      { id: 'firstaid', title: 'Домедична', count: 2, ids: ['f-0'] },
    ];
    const r = readiness(pools, {});
    expect(r.blocks.map((b) => b.drawn)).toEqual([11, 1]);
  });
});

describe('formatChance', () => {
  it('never rounds a possible pass to 0% or a possible fail to 100%', () => {
    expect(formatChance(0)).toBe('0%');
    expect(formatChance(0.004)).toBe('менше 1%');
    expect(formatChance(0.684)).toBe('68%');
    expect(formatChance(0.996)).toBe('понад 99%');
    expect(formatChance(1)).toBe('100%');
  });
});
