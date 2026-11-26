/**
 * `sandbox-refusal.json`, the line or worker launch of a job that confinement refused, kept for the next pass's hold, read into the refusal:
 * read, validate, map.
 */
import { JobFileShapeUtil }       from '../utils/JobFileShapeUtil.ts';
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';

export const SANDBOX_REFUSAL_FORMAT_VERSION = 1;

/** The step whose line or launch never started, and why confinement refused it. */
export interface SandboxRefusal {
  step:   string;
  reason: string;
}

export type SandboxRefusalReading =
  | { verdict: 'readable'; refusal: SandboxRefusal }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

export class SandboxRefusalIngestion {
  constructor(private readonly refusalFilePath: string) {}

  /** Never throws: a refusal that cannot be read whole is `unreadable`, never a job confinement refused nothing. */
  read(): SandboxRefusalReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.refusalFilePath, SANDBOX_REFUSAL_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { document } = stored;
    const problem = JobFileShapeUtil.firstFieldProblemOf(document, {
      step:   [JobFileShapeUtil.valueIsText, 'text'],
      reason: [JobFileShapeUtil.valueIsText, 'text'],
    });
    if (problem !== null) return { verdict: 'unreadable', reason: problem };
    return { verdict: 'readable', refusal: { step: document['step'] as string, reason: document['reason'] as string } };
  }
}
