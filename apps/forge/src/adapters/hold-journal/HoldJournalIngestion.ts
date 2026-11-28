/** `hold-journal.json`, the redo record of one tracker write, read into absolute file paths: read, validate, map. */
import { isAbsolute, join } from 'node:path';

import type { HoldJournalProblem } from '../../shared/@types/HoldJournalProblem.ts';
import { storedFileTextOf }        from '../StoredFileText.ts';
import { StoredValueUtil }         from '../utils/StoredValueUtil.ts';

/** One file a hold writes or removes, its path absolute. */
export type JournaledFile = { kind: 'written'; filePath: string; contents: string } | { kind: 'removed'; filePath: string };

export type HoldJournalReading =
  | { verdict: 'absent' }
  | { verdict: 'readable'; files: JournaledFile[] }
  | { verdict: 'malformed'; problem: HoldJournalProblem };

export const HOLD_JOURNAL_FORMAT_VERSION = 1;

export const STORED_PATH_SEPARATOR = '/';

const UNSAFE_PATH_SEGMENTS = new Set(['', '.', '..']);

const WINDOWS_DRIVE_PREFIX = /^[a-z]:/i;

/** A stored path is relative to the data folder and never leaves it, so a hand-edited journal cannot replay a write anywhere else. */
function pathStaysInsideTheDataFolder(storedPath: string): boolean {
  if (isAbsolute(storedPath) || storedPath.includes('\\') || WINDOWS_DRIVE_PREFIX.test(storedPath)) return false;
  return storedPath.split(STORED_PATH_SEPARATOR).every((segment) => !UNSAFE_PATH_SEGMENTS.has(segment));
}

type StoredEntryReading = { verdict: 'readable'; file: JournaledFile } | { verdict: 'malformed'; problem: HoldJournalProblem };

function storedEntryReadingOf(entry: unknown, index: number, dataDirectory: string): StoredEntryReading {
  const field = `files[${index}]`;
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return { verdict: 'malformed', problem: { code: 'entry-not-an-object', field } };
  const { path, contents, removed } = entry as { path?: unknown; contents?: unknown; removed?: unknown };
  if (typeof path !== 'string' || !pathStaysInsideTheDataFolder(path)) {
    return { verdict: 'malformed', problem: { code: 'entry-path-outside-the-data-folder', field: `${field}.path` } };
  }
  const filePath = join(dataDirectory, path);
  if (removed === true && contents === undefined) return { verdict: 'readable', file: { kind: 'removed', filePath } };
  if (typeof contents === 'string' && removed === undefined) return { verdict: 'readable', file: { kind: 'written', filePath, contents } };
  return { verdict: 'malformed', problem: { code: 'entry-neither-contents-nor-removed', field } };
}

export class HoldJournalIngestion {
  constructor(private readonly journalFilePath: string, private readonly dataDirectory: string) {}

  /** Never throws: a journal that cannot be read, parsed or trusted whole is `malformed`, and none of its files is handed out. */
  read(): HoldJournalReading {
    const storedText = storedFileTextOf(this.journalFilePath);
    if (storedText.verdict === 'absent') return storedText;
    if (storedText.verdict === 'unreadable') return { verdict: 'malformed', problem: storedText.problem };

    const parsedJson = StoredValueUtil.parsedJsonOf(storedText.text);
    if (parsedJson.verdict === 'unparseable') return { verdict: 'malformed', problem: parsedJson.problem };
    const document = parsedJson.value as { version?: unknown; files?: unknown } | null;
    if (typeof document !== 'object' || document === null || Array.isArray(document)) return { verdict: 'malformed', problem: { code: 'not-a-json-object' } };
    if (document.version !== HOLD_JOURNAL_FORMAT_VERSION) {
      return { verdict: 'malformed', problem: { code: 'version-differs', field: 'version', expectedVersion: HOLD_JOURNAL_FORMAT_VERSION } };
    }
    if (!Array.isArray(document.files)) return { verdict: 'malformed', problem: { code: 'files-not-a-list', field: 'files' } };

    const files: JournaledFile[] = [];
    for (const [index, entry] of (document.files as unknown[]).entries()) {
      const entryReading = storedEntryReadingOf(entry, index, this.dataDirectory);
      if (entryReading.verdict === 'malformed') return entryReading;
      files.push(entryReading.file);
    }
    return { verdict: 'readable', files };
  }
}
