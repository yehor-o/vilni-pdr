import { EXAM_DURATION_SEC } from '../../logic/exam';

/**
 * Hand-off from "start" to the run screen. Kept in memory on purpose: a reload
 * of #/exam/run finds nothing here and goes back to the start screen instead of
 * silently starting a new attempt (resuming is out of scope).
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
