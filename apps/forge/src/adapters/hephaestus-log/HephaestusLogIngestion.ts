/**
 * `<data>/hephaestus.log`, appended in place one JSON line per record (`HephaestusLogWordingUtil.storedLineOf`). Each read takes only the
 * whole lines appended since the last one; an unterminated last line waits for its line feed. A line that is no record, such as the
 * refusal a successor printed to it as it ended, is a reading of its own, so a reader skips it and goes on.
 */
import {
  closeSync,
  existsSync,
  fstatSync,
  openSync,
  readSync
} from 'node:fs';

import { utf8TextOf }                   from '../Utf8Text.ts';
import { StoredValueUtil }              from '../utils/StoredValueUtil.ts';
import type { HephaestusLogProblem }    from './@types/HephaestusLogProblem.ts';
import type { StoredHephaestusLogLine } from './@types/StoredHephaestusLogLine.ts';

export type HephaestusLogLineReading =
  | { verdict: 'record'; lineNumber: number; line: StoredHephaestusLogLine }
  | { verdict: 'not-a-record'; lineNumber: number; storedText: string | null; problem: HephaestusLogProblem };

export type HephaestusLogReading =
  | { verdict: 'readable'; lines: HephaestusLogLineReading[] }
  | { verdict: 'absent' }
  | { verdict: 'unreadable'; problem: HephaestusLogProblem };

const LINE_FEED_BYTE = 0x0a;

const STORED_LINE_FIELDS = ['at', 'kind', 'details'] as const;

type LineOf = { verdict: 'record'; line: StoredHephaestusLogLine } | { verdict: 'not-a-record'; problem: HephaestusLogProblem };

/** One stored line read as a record: a JSON object whose `at`, `kind` and `details` are strings. */
function storedLineOf(text: string): LineOf {
  const parsedJson = StoredValueUtil.parsedJsonOf(text);
  if (parsedJson.verdict === 'unparseable') return { verdict: 'not-a-record', problem: parsedJson.problem };
  const { value } = parsedJson;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return { verdict: 'not-a-record', problem: { code: 'not-a-json-object' } };
  const fields = value as Record<string, unknown>;
  const mistypedField = STORED_LINE_FIELDS.find((field) => typeof fields[field] !== 'string');
  if (mistypedField !== undefined) return { verdict: 'not-a-record', problem: { code: 'field-not-a-string', field: mistypedField } };
  return { verdict: 'record', line: { at: String(fields['at']), kind: String(fields['kind']), details: String(fields['details']) } };
}

/** The bytes of the file from `offset` to its end; a file cut shorter than `offset` is read again from its start. */
function bytesFrom(filePath: string, offset: number): { bytes: Uint8Array; offset: number } {
  const descriptor = openSync(filePath, 'r');
  try {
    const { size } = fstatSync(descriptor);
    const start = size < offset ? 0 : offset;
    const bytes = new Uint8Array(size - start);
    const read = readSync(descriptor, bytes, 0, bytes.length, start);
    return { bytes: bytes.subarray(0, read), offset: start };
  } finally {
    closeSync(descriptor);
  }
}

export class HephaestusLogIngestion {
  private consumedBytes = 0;

  private linesRead = 0;

  constructor(private readonly logFilePath: string) {}

  /** A stored line's text read as a record, for a reader that holds lines already, such as a crash log's tail. */
  static lineOf(text: string): LineOf {
    return storedLineOf(text);
  }

  /** Never throws: a file that cannot be read now is `unreadable`, and its lines wait for a later read. Blank lines are passed over. */
  read(): HephaestusLogReading {
    if (!existsSync(this.logFilePath)) return { verdict: 'absent' };
    let read: { bytes: Uint8Array; offset: number };
    try {
      read = bytesFrom(this.logFilePath, this.consumedBytes);
    } catch (error) {
      return { verdict: 'unreadable', problem: { code: 'bytes-unreadable', systemError: error instanceof Error ? error.message : 'unknown error' } };
    }
    if (read.offset !== this.consumedBytes) this.linesRead = 0;
    const lines: HephaestusLogLineReading[] = [];
    let lineStart = 0;
    for (let lineEnd = read.bytes.indexOf(LINE_FEED_BYTE); lineEnd !== -1; lineEnd = read.bytes.indexOf(LINE_FEED_BYTE, lineStart)) {
      this.linesRead += 1;
      const text = utf8TextOf(read.bytes.subarray(lineStart, lineEnd));
      lineStart = lineEnd + 1;
      if (text?.trim() === '') continue;
      const lineNumber = this.linesRead;
      if (text === null) {
        lines.push({
          verdict: 'not-a-record', lineNumber, storedText: null, problem: { code: 'not-utf8-text' }
        });
        continue;
      }
      const stored = storedLineOf(text);
      lines.push(stored.verdict === 'record' ? { ...stored, lineNumber } : { ...stored, lineNumber, storedText: text });
    }
    this.consumedBytes = read.offset + lineStart;
    return { verdict: 'readable', lines };
  }
}
