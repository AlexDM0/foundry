/** `<lock folder>/generation-<n>`, one generation of a lock folder (the store's, the monitor registry's, the tracker list's, a landing's). */
import { storedFileTextOf }       from '../StoredFileText.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';

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
  | { verdict: 'unreadable'; reason: string };

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

  /** Never throws. `absent` is a record another holder removed after it moved past it, between a listing and this read. */
  read(): GenerationRecordReading {
    const storedText = storedFileTextOf(this.generationFilePath);
    if (storedText.verdict !== 'readable') return storedText;
    const stored = StoredJsonDocumentUtil.documentOfText(storedText.text, GENERATION_RECORD_FORMAT_VERSION);
    if (stored.verdict === 'unreadable') return stored;
    const { document } = stored;
    const holder = lockHolderOfStored(document['holder']);
    if (holder === null) return { verdict: 'unreadable', reason: 'its "holder" is not a process identity' };
    const { acquiredAt } = document;
    if (typeof acquiredAt !== 'string') return { verdict: 'unreadable', reason: 'its "acquiredAt" is not a string' };
    const state = stateOfStored(document['state']);
    if (state === null) return { verdict: 'unreadable', reason: `its "state" is not one of ${GENERATION_STATES.join(', ')}` };
    return { verdict: 'readable', record: { holder, acquiredAt, state } };
  }
}
