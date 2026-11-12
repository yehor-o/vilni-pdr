import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CATEGORY_IDS } from '../storage/types';
import { examPools, sampleExamQuestions } from '../logic/exam';
import { seededRng } from '../logic/random';
import { categoryBank } from './categories';
import type { QuestionData } from './types';

const data = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/data/questions.json', import.meta.url)), 'utf8'),
) as QuestionData;

const count = (topics: QuestionData['topics']) => topics.reduce((n, t) => n + t.questions.length, 0);

describe('category banks', () => {
  it('knows exactly the categories of the data file', () => {
    expect(data.categories.map((c) => c.id)).toEqual([...CATEGORY_IDS]);
  });

  it('category B is the bank used before categories (45 topics, 1762 questions)', () => {
    const b = categoryBank(data, 'B');
    expect(b.category).toBe('B');
    expect(b.categoryTitle).toBe('B1, B');
    expect(b.topics).toHaveLength(45);
    expect(count(b.topics)).toBe(1762);
    expect(b.topics.map((t) => t.id).slice(-4)).toEqual(['44', '45', '46', '47']);
  });

  it('falls back to B for an unknown category', () => {
    expect(categoryBank(data, 'Z').category).toBe('B');
  });

  it('every category can fill a 10/4/4/2 exam from its own blocks', () => {
    for (const id of CATEGORY_IDS) {
      const bank = categoryBank(data, id);
      const pools = examPools(bank.examBlocks, bank.topics);
      for (const p of pools) expect(p.ids.length, `${id} ${p.id}`).toBeGreaterThanOrEqual(p.count);
      const s = sampleExamQuestions(pools, seededRng(1));
      expect(new Set(s).size).toBe(20);
    }
  });
});
