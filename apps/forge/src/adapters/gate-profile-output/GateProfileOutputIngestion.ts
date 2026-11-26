/**
 * `<data>/gate-profile-runs/<P>.ndjson`, a gate profile's output, appended in place one versioned JSON line per piece. Each read takes only
 * the whole lines appended since the last one: an unterminated last line waits for its line feed, also when it ends inside a character.
 */
import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readSync
} from 'node:fs';

import { StoredJsonDocumentUtil } from '../utils/StoredJsonDocumentUtil.ts';

export type GateProfileOutputLineReading = { verdict: 'readable'; text: string } | { verdict: 'unreadable'; reason: string };

export type GateProfileOutputReading =
  | { verdict: 'readable'; lines: GateProfileOutputLineReading[] }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; reason: string };

export const GATE_PROFILE_OUTPUT_FORMAT_VERSION = 1;

const LINE_FEED_BYTE = 0x0a;

function lineReadingOf(lineText: string): GateProfileOutputLineReading {
  const stored = StoredJsonDocumentUtil.documentOfText(lineText, GATE_PROFILE_OUTPUT_FORMAT_VERSION);
  if (stored.verdict === 'unreadable') return stored;
  const { text } = stored.document;
  return typeof text === 'string' ? { verdict: 'readable', text } : { verdict: 'unreadable', reason: 'its "text" is not a string' };
}

/** The bytes of the file from `offset` to its end. */
function bytesFrom(filePath: string, offset: number): Uint8Array {
  const descriptor = openSync(filePath, 'r');
  try {
    const length = Math.max(fstatSync(descriptor).size - offset, 0);
    const bytes = new Uint8Array(length);
    const read = readSync(descriptor, bytes, 0, length, offset);
    return bytes.subarray(0, read);
  } finally {
    closeSync(descriptor);
  }
}

export class GateProfileOutputIngestion {
  private consumedBytes = 0;

  private readonly decoder = new TextDecoder();

  constructor(private readonly outputFilePath: string) {}

  /** Never throws: a file that cannot be read now is `unreadable`, and its lines wait for a later read. */
  read(): GateProfileOutputReading {
    if (!existsSync(this.outputFilePath)) return { verdict: 'absent' };
    let bytes: Uint8Array;
    try {
      bytes = bytesFrom(this.outputFilePath, this.consumedBytes);
    } catch (error) {
      return { verdict: 'unreadable', reason: `it could not be read (${error instanceof Error ? error.message : 'unknown error'})` };
    }
    const lines: GateProfileOutputLineReading[] = [];
    let lineStart = 0;
    for (let lineEnd = bytes.indexOf(LINE_FEED_BYTE); lineEnd !== -1; lineEnd = bytes.indexOf(LINE_FEED_BYTE, lineStart)) {
      lines.push(lineReadingOf(this.decoder.decode(bytes.subarray(lineStart, lineEnd))));
      lineStart = lineEnd + 1;
    }
    this.consumedBytes += lineStart;
    return { verdict: 'readable', lines };
  }
}
