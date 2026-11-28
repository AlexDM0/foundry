/**
 * Lists a store folder, one stored item per file of an extension, in file-name order. A missing folder reads as an empty store, so a
 * tracker that never opened one reads as it always did; nothing here throws because a stored file is bad.
 */
import { readdirSync, type Dirent } from 'node:fs';
import { join }                     from 'node:path';

import type { FileNameNamesAnotherKeyProblem } from '../../adapters/@types/UnreadableRecordProblem.ts';
import type { UnreadableRecordPlace }          from './@types/BoardRecords.ts';

export type KeyedFileReading<Item, Problem> =
  | { verdict: 'read'; item: Item; key: string }
  | { verdict: 'malformed'; problem: Problem; line: number };

/** A stored file the folder holds and cannot read, with what is wrong with it. */
export type UnreadableStoredFile<Problem> = UnreadableRecordPlace & { problem: Problem | FileNameNamesAnotherKeyProblem };

export interface StoreFolderListing<Item, Problem> {
  items:      Item[];
  unreadable: UnreadableStoredFile<Problem>[];
}

export interface KeyedStoreFolder<Item, Problem> {
  directory: string;
  extension: string;
  /** The stored field that must equal the file name, as the malformed problem names it. */
  keyField:  string;
  readingOf: (filePath: string) => KeyedFileReading<Item, Problem>;
}

/** A folder or other entry that is no file is not a stored item: `clear --all` could never remove it, and no reading could read it. */
export function storeFolderFileNamesIn(directory: string, extension: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => (entry.isFile() || entry.isSymbolicLink()) && entry.name.endsWith(extension)).map((entry) => entry.name).sort();
}

/**
 * An item is its file name: a file whose key says otherwise is listed as unreadable, since which of the two is the item cannot be judged.
 * An unreadable file is keyed by its name.
 */
export function listStoreFolder<Item, Problem>(folder: KeyedStoreFolder<Item, Problem>): StoreFolderListing<Item, Problem> {
  const items: Item[]                                = [];
  const unreadable: UnreadableStoredFile<Problem>[] = [];

  for (const fileName of storeFolderFileNamesIn(folder.directory, folder.extension)) {
    const filePath  = join(folder.directory, fileName);
    const reading   = folder.readingOf(filePath);
    const keyInName = fileName.slice(0, -folder.extension.length);

    const unreadableEntry = (problem: Problem | FileNameNamesAnotherKeyProblem, line: number): UnreadableStoredFile<Problem> => ({
      key: keyInName, location: filePath, problem, line
    });

    if (reading.verdict === 'malformed') unreadable.push(unreadableEntry(reading.problem, reading.line));
    else if (reading.key !== keyInName) {
      unreadable.push(unreadableEntry({
        code: 'file-name-names-another-key', field: folder.keyField, keyInFileName: keyInName, storedKey: reading.key
      }, 0));
    }
    else items.push(reading.item);
  }
  return { items, unreadable };
}
