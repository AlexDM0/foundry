import { existsSync, readFileSync } from 'node:fs';

import type { BaseStoredFileProblem } from '../shared/@types/StoredFileProblem.ts';
import { utf8TextOf }                 from './Utf8Text.ts';

export type StoredFileText =
  | { verdict: 'readable'; text: string }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: BaseStoredFileProblem };

const BYTE_ORDER_MARK = '\uFEFF';

/**
 * Never throws. A file that exists but cannot be read, or is not UTF-8, is `unreadable`, never `absent`, which would invite treating a good
 * file as missing. A leading byte order mark, which Windows editors write, is not part of the text, unless `keepsByteOrderMark` says the file
 * holds its text byte for byte, as a file named by the hash of its text does.
 */
export function storedFileTextOf(filePath: string, keepsByteOrderMark = false): StoredFileText {
  let bytes: Uint8Array;
  try {
    bytes = readFileSync(filePath);
  } catch (error) {
    if (!existsSync(filePath)) return { verdict: 'absent' };
    return { verdict: 'unreadable', problem: { code: 'bytes-unreadable', systemError: error instanceof Error ? error.message : 'unknown error' } };
  }
  const text = utf8TextOf(bytes);
  if (text === null) return { verdict: 'unreadable', problem: { code: 'not-utf8-text' } };
  return { verdict: 'readable', text: !keepsByteOrderMark && text.startsWith(BYTE_ORDER_MARK) ? text.slice(BYTE_ORDER_MARK.length) : text };
}
