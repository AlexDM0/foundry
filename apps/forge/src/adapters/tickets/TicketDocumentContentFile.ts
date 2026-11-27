/** One version of a ticket document, `<contentHash>.md`: its text as the hash names it, stored once before the record names it and never rewritten. */
import { TicketDocumentVersionUtil }         from '../../lib/tracker-model/utils/TicketDocumentVersionUtil.ts';
import { storedFileTextOf }                  from '../StoredFileText.ts';
import type { TicketDocumentContentProblem } from './@types/TicketDocumentContentProblem.ts';

export type TicketDocumentContentReading =
  | { verdict: 'readable'; text: string }
  | { verdict: 'unreadable'; problem: TicketDocumentContentProblem };

const VERSION_FILE_EXTENSION = '.md';

function fileNameOf(contentHash: string): string {
  return `${contentHash}${VERSION_FILE_EXTENSION}`;
}

/**
 * Never throws. A file whose text does not hash to the hash it is kept under is no version: it was changed. The text is read byte for
 * byte, a leading byte order mark kept, since the hash was taken over it.
 */
function read(filePath: string, contentHash: string): TicketDocumentContentReading {
  const stored = storedFileTextOf(filePath, true);
  if (stored.verdict === 'absent') return { verdict: 'unreadable', problem: { code: 'no-text-under-the-hash', contentHash } };
  if (stored.verdict === 'unreadable') return stored;
  if (TicketDocumentVersionUtil.contentHashOf(stored.text) !== contentHash) return { verdict: 'unreadable', problem: { code: 'text-hash-differs', contentHash } };
  return { verdict: 'readable', text: stored.text };
}

export const TicketDocumentContentFile = Object.freeze({ fileNameOf, read });
