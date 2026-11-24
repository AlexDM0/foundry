import { existsSync, readFileSync } from 'node:fs';

import { utf8TextOf } from './Utf8Text.ts';

export type StoredFileText =
  | { verdict: 'readable'; text: string }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

const BYTE_ORDER_MARK = '\uFEFF';

/**
 * Never throws. A file that exists but cannot be read is `unreadable`, never `absent`, because `absent` invites the caller to treat a good
 * file as missing, and so is one that is not UTF-8; the reason is worded as an ingestion reports it, so a caller that names the file only
 * prefixes it. A leading byte order mark, which Windows editors write, is not part of the text, unless `keepsByteOrderMark` says the file
 * holds a text byte for byte, as a file named by the hash of its text does.
 */
export function storedFileTextOf(filePath: string, keepsByteOrderMark = false): StoredFileText {
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(filePath);
  } catch (error) {
    if (!existsSync(filePath)) return { verdict: 'absent' };
    return { verdict: 'unreadable', reason: `it could not be read (${error instanceof Error ? error.message : 'unknown error'})` };
  }
  const text = utf8TextOf(bytes);
  if (text === null) return { verdict: 'unreadable', reason: 'it is not UTF-8 text' };
  return { verdict: 'readable', text: !keepsByteOrderMark && text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text };
}
