/**
 * Lists a store folder, one stored item per file of an extension, in file-name order. A missing folder reads as an empty store, so a
 * tracker that never opened one reads as it always did; nothing here throws because a stored file is bad.
 */
import { readdirSync, type Dirent } from 'node:fs';
import { join }                     from 'node:path';

export type KeyedFileReading<Item> =
  | { verdict: 'read'; item: Item; key: string }
  | { verdict: 'malformed'; reason: string; line: number };

export interface StoreFolderListing<Item> {
  items:     Item[];
  malformed: { filePath: string; reason: string; line: number }[];
}

export interface KeyedStoreFolder<Item> {
  directory: string;
  extension: string;
  /** The stored field that must equal the file name, as the malformed reason names it. */
  keyField:  string;
  readingOf: (filePath: string) => KeyedFileReading<Item>;
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

/** An item is its file name: a file whose key says otherwise is listed as malformed, since which of the two is the item cannot be judged. */
export function listStoreFolder<Item>(folder: KeyedStoreFolder<Item>): StoreFolderListing<Item> {
  const items: Item[] = [];
  const malformed: StoreFolderListing<Item>['malformed'] = [];

  for (const fileName of storeFolderFileNamesIn(folder.directory, folder.extension)) {
    const filePath  = join(folder.directory, fileName);
    const reading   = folder.readingOf(filePath);
    const keyInName = fileName.slice(0, -folder.extension.length);

    if (reading.verdict === 'malformed') malformed.push({ filePath, reason: reading.reason, line: reading.line });
    else if (reading.key !== keyInName) {
      malformed.push({ filePath, reason: `the file name says ${keyInName} but its \`${folder.keyField}\` is ${reading.key}`, line: 0 });
    }
    else items.push(reading.item);
  }
  return { items, malformed };
}
