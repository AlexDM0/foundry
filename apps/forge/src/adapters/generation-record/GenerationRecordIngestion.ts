/**
 * `<lock folder>/generation-<n>`, one generation of a lock folder (the store's, the monitor registry's, the tracker list's, a landing's). It
 * is a holding judged by its process, so a record of today's fields reads whatever its version.
 */
import { storedFileTextOf }                                           from '../StoredFileText.ts';
import { StoredJsonDocumentUtil }                                     from '../utils/StoredJsonDocumentUtil.ts';
import type { GenerationRecordBytesProblem, GenerationRecordProblem } from './@types/GenerationRecordProblem.ts';

/** A lock record's holder by process identity: `null` where the platform cannot read the process's start or boot. */
export interface GenerationRecordHolder {
  processId:    number;
  startStamp:   string | null;
  bootIdentity: string | null;
}

export const GENERATION_STATES = ['held', 'released'] as const;
export type GenerationState = typeof GENERATION_STATES[number];

/** `acquiredAt` is a fact for a report, never judged. */
export interface GenerationRecord {
  holder:     GenerationRecordHolder;
  acquiredAt: string;
  state:      GenerationState;
}

export type GenerationRecordReading =
  | { verdict: 'readable'; record: GenerationRecord }
  | { verdict: 'absent' }
  | { verdict: 'bytes-unreadable'; problem: GenerationRecordBytesProblem }
  | { verdict: 'unreadable'; problem: GenerationRecordProblem };

export const GENERATION_RECORD_FORMAT_VERSION = 1;

function nullOrStringOf(value: unknown): string | null | undefined {
  return value === null || typeof value === 'string' ? value : undefined;
}

function lockHolderOfStored(stored: unknown): GenerationRecordHolder | null {
  if (typeof stored !== 'object' || stored === null) return null;
  const { processId, startStamp, bootIdentity } = stored as Record<string, unknown>;
  const readStartStamp   = nullOrStringOf(startStamp);
  const readBootIdentity = nullOrStringOf(bootIdentity);
  if (typeof processId !== 'number' || readStartStamp === undefined || readBootIdentity === undefined) return null;
  return { processId, startStamp: readStartStamp, bootIdentity: readBootIdentity };
}

function stateOfStored(stored: unknown): GenerationState | null {
  return GENERATION_STATES.find((state) => state === stored) ?? null;
}

export class GenerationRecordIngestion {
  constructor(private readonly generationFilePath: string) {}

  /**
   * Never throws. `absent` is a record another holder removed after it moved past it, between a listing and this read. `bytes-unreadable` is
   * a read that failed now, as on EACCES or EMFILE, which says nothing of the record's shape; `unreadable` is a record whose shape cannot be read.
   */
  read(): GenerationRecordReading {
    const storedText = storedFileTextOf(this.generationFilePath);
    if (storedText.verdict === 'unreadable' && storedText.problem.code === 'bytes-unreadable') {
      return { verdict: 'bytes-unreadable', problem: storedText.problem };
    }
    if (storedText.verdict !== 'readable') return storedText;
    const stored = StoredJsonDocumentUtil.holdingDocumentOfText(storedText.text);
    if (stored.verdict === 'unreadable') return stored;
    const { document } = stored;
    const holder = lockHolderOfStored(document['holder']);
    if (holder === null) return { verdict: 'unreadable', problem: { code: 'field-not-a-process-identity', field: 'holder' } };
    const { acquiredAt } = document;
    if (typeof acquiredAt !== 'string') return { verdict: 'unreadable', problem: { code: 'field-not-a-string', field: 'acquiredAt' } };
    const state = stateOfStored(document['state']);
    if (state === null) return { verdict: 'unreadable', problem: { code: 'state-not-a-generation-state', field: 'state' } };
    return { verdict: 'readable', record: { holder, acquiredAt, state } };
  }
}
