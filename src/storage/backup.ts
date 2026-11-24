import { normalizeProgress } from './normalize';
import type { ProgressData } from './types';

/** Format of the backup file; bump when the file layout changes incompatibly. */
export const BACKUP_VERSION = 1;
const BACKUP_APP = 'vilni-pdr';
const BACKUP_KIND = 'progress';

export interface BackupSummary {
  /** Questions with an answer record (all categories). */
  answered: number;
  /** Finished exams in history (all categories). */
  exams: number;
}

export type ParsedBackup =
  | { ok: true; data: ProgressData; exportedAt: number | null; summary: BackupSummary }
  | { ok: false; reason: 'not-json' | 'not-ours' | 'newer' };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function backupSummary(data: ProgressData): BackupSummary {
  return { answered: Object.keys(data.answers).length, exams: data.exams.length };
}

/** Backup file contents. An exam in progress is not exported. */
export function serializeBackup(data: ProgressData, now: number): string {
  const { activeExam, ...rest } = data;
  return JSON.stringify({ app: BACKUP_APP, kind: BACKUP_KIND, version: BACKUP_VERSION, exportedAt: now, data: rest }, null, 1);
}

/** Validates a backup file; invalid parts inside `data` are dropped, not fatal. */
export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (!isObject(raw) || raw.app !== BACKUP_APP || raw.kind !== BACKUP_KIND || !isObject(raw.data)) {
    return { ok: false, reason: 'not-ours' };
  }
  const { version } = raw;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return { ok: false, reason: 'not-ours' };
  if (version > BACKUP_VERSION) return { ok: false, reason: 'newer' };

  const data: ProgressData = { ...normalizeProgress(raw.data), activeExam: null };
  const { exportedAt } = raw;
  return {
    ok: true,
    data,
    exportedAt: typeof exportedAt === 'number' && Number.isFinite(exportedAt) && exportedAt >= 0 ? exportedAt : null,
    summary: backupSummary(data),
  };
}

/** `vilni-pdr-progres-YYYY-MM-DD.json`, local date. */
export function backupFileName(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `vilni-pdr-progres-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
