import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOPIC_TITLES, topicTitle } from './topicTitles';
import type { QuestionBank } from './types';

const bank = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../public/data/questions.b.json', import.meta.url)), 'utf8'),
) as QuestionBank;

const lower = (s: string) => s.toLocaleLowerCase('uk');

describe('topic titles', () => {
  it('has a display title for every topic in the data file', () => {
    for (const t of bank.topics) expect(TOPIC_TITLES[t.id], `topic ${t.id}`).toBeDefined();
    expect(Object.keys(TOPIC_TITLES)).toHaveLength(bank.topics.length);
  });

  it('changes letter case only', () => {
    for (const t of bank.topics) {
      const display = TOPIC_TITLES[t.id];
      if (display === undefined) continue;
      expect(lower(display), `topic ${t.id}`).toBe(lower(t.title));
    }
  });

  it('falls back to the official title for unknown ids', () => {
    expect(topicTitle('999', 'НЕВІДОМА ТЕМА')).toBe('НЕВІДОМА ТЕМА');
  });
});
