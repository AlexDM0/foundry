/**
 * `start-<startNumber>.json`: what Hephaestus hands a Talos it starts, its endpoint, its secret's file and every bound, so a spec can pass
 * short ones. A reader gets a verdict, never a throw.
 */
import { isAbsolute } from 'node:path';

import { TALOS_START_FILE_FORMAT_VERSION }           from './constants/TalosProtocol.ts';
import { ParsedValueUtil, type StoredRecordReading } from './utils/ParsedValueUtil.ts';

export interface TalosStartFile {
  formatVersion:               typeof TALOS_START_FILE_FORMAT_VERSION;
  startNumber:                 number;
  /** Absolute; every child folder resolves under it. */
  boardFolder:                 string;
  endpoint:                    string;
  secretFilePath:              string;
  /** The code version of the Hephaestus that started it, recorded and reported, never compared. */
  codeVersion:                 string;
  leaseMilliseconds:           number;
  renewalIntervalMilliseconds: number;
  cleanQuitWaitMilliseconds:   number;
  tickMilliseconds:            number;
  tickGapMilliseconds:         number;
}

const BOUND_KEYS = [
  'leaseMilliseconds',
  'renewalIntervalMilliseconds',
  'cleanQuitWaitMilliseconds',
  'tickMilliseconds',
  'tickGapMilliseconds',
] as const satisfies readonly (keyof TalosStartFile)[];

export function talosStartFileTextOf(startFile: TalosStartFile): string {
  return ParsedValueUtil.storedTextOf(startFile);
}

export function talosStartFileOf(text: string): StoredRecordReading<TalosStartFile> {
  const reading = ParsedValueUtil.parsedObjectOf(text, TALOS_START_FILE_FORMAT_VERSION);
  if (reading.verdict !== 'object') return reading;
  const field = (key: keyof TalosStartFile): unknown => ParsedValueUtil.ownFieldOf(reading.parsed, key);
  const unreadable = (reason: string): StoredRecordReading<TalosStartFile> => ({ verdict: 'unreadable', reason });
  const startNumber = field('startNumber');
  const boardFolder = field('boardFolder');
  const endpoint = field('endpoint');
  const secretFilePath = field('secretFilePath');
  const codeVersion = field('codeVersion');
  if (!ParsedValueUtil.isWholeNumberAtLeast(startNumber, 1)) return unreadable('startNumber is not a whole number from 1');
  if (typeof boardFolder !== 'string' || !isAbsolute(boardFolder)) return unreadable('boardFolder is not an absolute path');
  if (typeof endpoint !== 'string' || endpoint === '') return unreadable('endpoint is not a non-empty string');
  if (typeof secretFilePath !== 'string' || !isAbsolute(secretFilePath)) return unreadable('secretFilePath is not an absolute path');
  if (typeof codeVersion !== 'string') return unreadable('codeVersion is not a string');
  const unboundedKey = BOUND_KEYS.find((key) => !ParsedValueUtil.isWholeNumberAtLeast(field(key), 1));
  if (unboundedKey !== undefined) return unreadable(`${unboundedKey} is not a whole number of milliseconds above 0`);
  const boundOf = (key: typeof BOUND_KEYS[number]): number => field(key) as number;
  return {
    verdict: 'read',
    record:  {
      formatVersion:               TALOS_START_FILE_FORMAT_VERSION,
      startNumber,
      boardFolder,
      endpoint,
      secretFilePath,
      codeVersion,
      leaseMilliseconds:           boundOf('leaseMilliseconds'),
      renewalIntervalMilliseconds: boundOf('renewalIntervalMilliseconds'),
      cleanQuitWaitMilliseconds:   boundOf('cleanQuitWaitMilliseconds'),
      tickMilliseconds:            boundOf('tickMilliseconds'),
      tickGapMilliseconds:         boundOf('tickGapMilliseconds'),
    },
  };
}
