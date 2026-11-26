/** `stale-green-session-owner.json`, the session a build or review job's first instance resumed for a stale green: read, validate, map. */
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';

/** `null` is the recorded answer that the job resumes no ended session. */
export type StaleGreenSessionOwnerReading =
  | { verdict: 'readable'; sessionOwnerJobId: string | null }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

export const STALE_GREEN_SESSION_OWNER_FORMAT_VERSION = 1;

export class StaleGreenSessionOwnerIngestion {
  constructor(private readonly ownerFilePath: string) {}

  /** Never throws. */
  read(): StaleGreenSessionOwnerReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.ownerFilePath, STALE_GREEN_SESSION_OWNER_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { sessionOwnerJobId } = stored.document;
    if (sessionOwnerJobId === null) return { verdict: 'readable', sessionOwnerJobId };
    if (typeof sessionOwnerJobId !== 'string' || sessionOwnerJobId === '') {
      return { verdict: 'unreadable', reason: 'its "sessionOwnerJobId" is neither a job id nor null' };
    }
    return { verdict: 'readable', sessionOwnerJobId };
  }
}
