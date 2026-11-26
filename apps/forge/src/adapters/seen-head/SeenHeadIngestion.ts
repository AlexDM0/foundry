/** `document-agent-seen-head.json` in a document agent's job folder, the content hash of the head it saw last: read, validate, map. */
import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';

export const SEEN_HEAD_FORMAT_VERSION = 1;

/** `contentHash` is `null` while the document had no head. */
export type SeenHeadReading =
  | { verdict: 'readable'; contentHash: string | null }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

export class SeenHeadIngestion {
  constructor(private readonly seenHeadFilePath: string) {}

  /** Never throws: a file that exists but cannot be read, parsed or trusted whole is `unreadable`, never `absent`. */
  read(): SeenHeadReading {
    const stored = StoredJsonDocumentUtil.documentAt(this.seenHeadFilePath, SEEN_HEAD_FORMAT_VERSION);
    if (stored.verdict !== 'readable') return stored;
    const { contentHash } = stored.document;
    if (contentHash !== null && typeof contentHash !== 'string') return { verdict: 'unreadable', reason: 'its contentHash is neither text nor null' };
    return { verdict: 'readable', contentHash };
  }
}
