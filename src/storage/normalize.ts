import {
  DEFAULT_SETTINGS,
  DEFAULT_CATEGORY,
  MAX_EXAMS,
  emptyProgress,
  isCategoryId,
  type AnswerRecord,
  type ExamAttempt,
  type ProgressData,
} from './types';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function normalizeAnswer(v: unknown): AnswerRecord | null {
  if (!isObject(v)) return null;
  const { attempts, correctCount, lastChoice, lastCorrect, lastAt } = v;
  if (!isCount(attempts) || attempts === 0 || !isCount(correctCount) || correctCount > attempts) return null;
  if (!isCount(lastChoice) || typeof lastCorrect !== 'boolean') return null;
  return {
    attempts,
    correctCount,
    lastChoice,
    lastCorrect,
    lastAt: isTime(lastAt) ? lastAt : 0,
  };
}

const END_REASONS = new Set(['completed', 'mistakes', 'timeout']);

function normalizeExam(v: unknown): ExamAttempt | null {
  if (!isObject(v)) return null;
  const { id, startedAt, finishedAt, durationSec, questionIds, answers, correctCount, mistakes, passed, endReason, instantFeedback } = v;
  if (typeof id !== 'string' || !id) return null;
  if (!isTime(startedAt) || !isTime(finishedAt) || !isCount(durationSec)) return null;
  if (!Array.isArray(questionIds) || questionIds.length === 0 || !questionIds.every((q) => typeof q === 'string')) return null;
  if (!Array.isArray(answers) || answers.length !== questionIds.length) return null;
  if (!answers.every((a) => a === null || isCount(a))) return null;
  if (!isCount(correctCount) || !isCount(mistakes) || correctCount + mistakes !== questionIds.length) return null;
  if (typeof passed !== 'boolean' || typeof instantFeedback !== 'boolean') return null;
  if (typeof endReason !== 'string' || !END_REASONS.has(endReason)) return null;
  const { seenCount, category } = v;
  return {
    ...(isCount(seenCount) && seenCount >= 1 && seenCount <= questionIds.length ? { seenCount } : {}),
    // Old records have no category: they were all taken in category B.
    category: isCategoryId(category) ? category : DEFAULT_CATEGORY,
    id,
    startedAt,
    finishedAt,
    durationSec,
    questionIds: questionIds as string[],
    answers: answers as (number | null)[],
    correctCount,
    mistakes,
    passed,
    endReason: endReason as ExamAttempt['endReason'],
    instantFeedback,
  };
}

/**
 * Turns anything read from storage into valid ProgressData. Invalid parts are
 * dropped individually; a completely unusable value yields empty progress.
 */
export function normalizeProgress(raw: unknown): ProgressData {
  const data = emptyProgress();
  if (!isObject(raw)) return data;

  if (isObject(raw.answers)) {
    for (const [id, rec] of Object.entries(raw.answers)) {
      const a = normalizeAnswer(rec);
      if (a) data.answers[id] = a;
    }
  }
  if (isObject(raw.topicPositions)) {
    for (const [id, pos] of Object.entries(raw.topicPositions)) {
      if (isCount(pos)) data.topicPositions[id] = pos;
    }
  }
  if (isObject(raw.topicPassStarts)) {
    for (const [id, t] of Object.entries(raw.topicPassStarts)) {
      if (isTime(t)) data.topicPassStarts[id] = t;
    }
  }
  if (isObject(raw.marathonPassStarts)) {
    for (const [cat, t] of Object.entries(raw.marathonPassStarts)) {
      if (isCategoryId(cat) && isTime(t)) data.marathonPassStarts[cat] = t;
    }
  }
  // Before categories there was one lap start, always for category B.
  if (isTime(raw.marathonPassStart) && raw.marathonPassStart > 0 && !(DEFAULT_CATEGORY in data.marathonPassStarts)) {
    data.marathonPassStarts[DEFAULT_CATEGORY] = raw.marathonPassStart;
  }
  if (Array.isArray(raw.exams)) {
    const seen = new Set<string>();
    for (const e of raw.exams) {
      const x = normalizeExam(e);
      if (x && !seen.has(x.id)) {
        seen.add(x.id);
        data.exams.push(x);
      }
    }
    data.exams = data.exams.slice(-MAX_EXAMS);
  }
  if (isObject(raw.settings)) {
    const s = raw.settings;
    data.settings = {
      category: isCategoryId(s.category) ? s.category : DEFAULT_SETTINGS.category,
      examInstantFeedback:
        typeof s.examInstantFeedback === 'boolean' ? s.examInstantFeedback : DEFAULT_SETTINGS.examInstantFeedback,
      practiceOrder:
        s.practiceOrder === 'official' || s.practiceOrder === 'shuffled'
          ? s.practiceOrder
          : DEFAULT_SETTINGS.practiceOrder,
    };
  }
  return data;
}
