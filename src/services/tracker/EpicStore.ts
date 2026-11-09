/**
 * The epics directory as a store: `<key>.md` per epic. Nothing here throws because an epic file is bad: a malformed file is a listing
 * entry, so one broken file cannot take down `status` or `render`.
 */
import { join }                                    from 'node:path';
import { EpicFileIngestion }                       from '../../adapters/epics/EpicFileIngestion.ts';
import type { Epic }                               from '../../lib/tracker-model/@types/Epic.ts';
import { listStoreFolder, storeFolderFileNamesIn } from './StoreFolderListing.ts';
import type { MalformedTicketFile }                from './TicketStore.ts';
import type { Workspace }                          from './Workspace.ts';

/** The same report a malformed ticket file makes: the file, why, and the line. */
export type MalformedEpicFile = MalformedTicketFile;

export interface EpicListing {
  epics:     Epic[];
  malformed: MalformedEpicFile[];
}

const EPIC_FILE_EXTENSION = '.md';

/** An epic is its file name: a file whose `key` says otherwise is listed as malformed. */
export function listEpics(workspace: Workspace): EpicListing {
  const listing = listStoreFolder<Epic>({
    directory: workspace.epicsDirectory,
    extension: EPIC_FILE_EXTENSION,
    keyField:  'key',
    readingOf: (filePath) => {
      const reading = new EpicFileIngestion(filePath).read();
      return reading.verdict === 'malformed' ? reading : { verdict: 'read', item: reading.epic, key: reading.epic.frontmatter.key };
    },
  });
  return { epics: listing.items, malformed: listing.malformed };
}

/** `clear --all`: the Board already removed every epic it read, so this takes the files it could not read. */
/** Every epic file `clear --all` removes, whether or not it parses. */
export function everyEpicFilePathIn(workspace: Workspace): string[] {
  return storeFolderFileNamesIn(workspace.epicsDirectory, EPIC_FILE_EXTENSION).map((fileName) => join(workspace.epicsDirectory, fileName));
}

export function epicFilePathOf(workspace: Workspace, epicKey: string): string {
  return join(workspace.epicsDirectory, `${epicKey}${EPIC_FILE_EXTENSION}`);
}
