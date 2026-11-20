/** A committed ticket's kept content, `<hash>.json`: its title and body as the hash names them, stored whole once and never rewritten. */
import { TicketBodyHashUtil } from '../../lib/tracker-model/utils/TicketBodyHashUtil.ts';
import { storedFileTextOf }   from '../StoredFileText.ts';
import { StoredValueUtil }    from '../utils/StoredValueUtil.ts';

export interface CommittedContent {
  title: string;
  body:  string;
}

/** The reason an unreadable ticket record carries when the content its hash names cannot be read; the store's readers match it. */
export const COMMITTED_CONTENT_MISSING = 'committed-content-missing';

export type CommittedContentReading =
  | { verdict: 'readable'; content: CommittedContent }
  | { verdict: 'unreadable'; reason: string };

const KEPT_CONTENT_FILE_EXTENSION = '.json';

function fileNameOf(contentHash: string): string {
  return `${contentHash}${KEPT_CONTENT_FILE_EXTENSION}`;
}

function contentsOf(content: CommittedContent): string {
  return `${JSON.stringify({ title: content.title, body: content.body }, null, 2)}\n`;
}

function unreadable(problem: string): CommittedContentReading {
  return { verdict: 'unreadable', reason: `${COMMITTED_CONTENT_MISSING}: ${problem}` };
}

/** Never throws. A kept file whose title and body do not hash to the hash it is kept under is no kept content: it was changed. */
function read(filePath: string, contentHash: string): CommittedContentReading {
  const stored = storedFileTextOf(filePath);
  if (stored.verdict === 'absent') return unreadable(`no content is kept under the hash ${contentHash}`);
  if (stored.verdict === 'unreadable') return unreadable(stored.reason);
  const parsed = StoredValueUtil.parsedJsonOf(stored.text);
  if (parsed.verdict === 'unparseable') return unreadable(parsed.problem);
  const document = parsed.value as { title?: unknown; body?: unknown } | null;
  if (typeof document !== 'object' || document === null || typeof document.title !== 'string' || typeof document.body !== 'string') {
    return unreadable('it is not an object of a text "title" and a text "body"');
  }
  if (TicketBodyHashUtil.contentHashOf(document.title, document.body) !== contentHash) {
    return unreadable(`its title and body do not hash to ${contentHash}`);
  }
  return { verdict: 'readable', content: { title: document.title, body: document.body } };
}

export const CommittedContentFile = {
  contentsOf, fileNameOf, read, KEPT_CONTENT_FILE_EXTENSION
} as const;
