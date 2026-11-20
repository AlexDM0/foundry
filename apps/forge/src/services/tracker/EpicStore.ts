/**
 * The epics directory as a store: `<key>.md` per epic. Nothing here throws because an epic file is bad: a malformed file is a listing
 * entry, so one broken file cannot take down `status` or `render`.
 */
import { join }                                    from 'node:path';
import { EpicFileIngestion }                       from '../../adapters/epics/EpicFileIngestion.ts';
import type { Epic }                               from '../../lib/tracker-model/@types/Epic.ts';
import type { BoardContents }                      from './@types/BoardRecords.ts';
import { listStoreFolder, storeFolderFileNamesIn } from './StoreFolderListing.ts';
import type { Workspace }                          from './Workspace.ts';

export type EpicListing = BoardContents['epicListing'];

const EPIC_FILE_EXTENSION = '.md';

/** An epic is its file name: a file whose `key` says otherwise is listed as unreadable. */
export function listEpics(workspace: Workspace): EpicListing {
  const listing = listStoreFolder<Epic>({
    record:    'epic',
    directory: workspace.epicsDirectory,
    extension: EPIC_FILE_EXTENSION,
    keyField:  'key',
    readingOf: (filePath) => {
      const reading = new EpicFileIngestion(filePath).read();
      return reading.verdict === 'malformed' ? reading : { verdict: 'read', item: reading.epic, key: reading.epic.frontmatter.key };
    },
  });
  return { epics: listing.items, unreadable: listing.unreadable };
}

/** `clear --all`: the Board already removed every epic it read, so this takes the files it could not read. */
/** Every epic file `clear --all` removes, whether or not it parses. */
export function everyEpicFilePathIn(workspace: Workspace): string[] {
  return storeFolderFileNamesIn(workspace.epicsDirectory, EPIC_FILE_EXTENSION).map((fileName) => join(workspace.epicsDirectory, fileName));
}

export function epicFilePathOf(workspace: Workspace, epicKey: string): string {
  return join(workspace.epicsDirectory, `${epicKey}${EPIC_FILE_EXTENSION}`);
}
