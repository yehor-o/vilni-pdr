import { EXAM_DURATION_SEC } from '../../logic/exam';

/**
 * Hand-off from "start" to the run screen. Kept in memory on purpose: a reload
 * of #/exam/run finds nothing here, so it never silently starts a new attempt;
 * instead the run screen resumes the active exam from storage (or goes back to
 * the start screen if there is none).
 */
let pending: { durationSec: number } | null = null;

export function requestExamStart(durationSec = EXAM_DURATION_SEC) {
  pending = { durationSec };
}

export function peekExamStart() {
  return pending;
}

export function clearExamStart() {
  pending = null;
}

/** Dev-only: `#/exam?examSeconds=30` shortens the timer for manual testing. */
export function devExamSeconds(search: string): number | undefined {
  if (!import.meta.env.DEV) return undefined;
  const v = Number(new URLSearchParams(search).get('examSeconds'));
  return Number.isInteger(v) && v > 0 ? v : undefined;
}
