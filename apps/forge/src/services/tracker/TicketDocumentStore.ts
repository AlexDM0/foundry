/**
 * The tickets' documents as a store: `ticket-documents/<ticketId>/record.json` beside one `<contentHash>.md` per version. A record that
 * cannot be read, or that names a version whose text is missing or changed, is a listing entry, never a throw.
 */
import { readdirSync, rmdirSync, type Dirent } from 'node:fs';
import { join }                                from 'node:path';

import type { UnreadableTicketDocumentsProblem }               from '../../adapters/@types/UnreadableRecordProblem.ts';
import { TicketDocumentContentFile }                           from '../../adapters/tickets/TicketDocumentContentFile.ts';
import { TicketDocumentsFileIngestion }                        from '../../adapters/tickets/TicketDocumentsFileIngestion.ts';
import type { LoadedTicketDocumentRecord }                     from '../../domain/tracker-model/@types/TicketDocument.ts';
import type { BoardContents, UnreadableTicketDocumentsRecord } from './@types/BoardRecords.ts';
import { localStoreLayoutOf }                                  from './LocalStoreLayout.ts';
import type { Workspace }                                      from './Workspace.ts';

export type TicketDocumentListing = BoardContents['ticketDocumentListing'];

const RECORD_FILE_NAME = 'record.json';

function ticketFolderNamesIn(folder: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(folder, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

function folderIsEmpty(folder: string): boolean {
  try {
    return readdirSync(folder).length === 0;
  } catch {
    return false;
  }
}

function ticketFolderOf(workspace: Workspace, ticketId: string): string {
  return join(localStoreLayoutOf(workspace).ticketDocumentRecordsFolder, ticketId);
}

export function ticketDocumentRecordPathOf(workspace: Workspace, ticketId: string): string {
  return join(ticketFolderOf(workspace, ticketId), RECORD_FILE_NAME);
}

export function ticketDocumentVersionPathOf(workspace: Workspace, ticketId: string, contentHash: string): string {
  return join(ticketFolderOf(workspace, ticketId), TicketDocumentContentFile.fileNameOf(contentHash));
}

/**
 * A ticket's folder is its id: a record whose `ticketId` says otherwise is unreadable, as is one naming a version with no good text. An empty
 * folder holds no record: it is what a clear of every ticket leaves when it stops before the folder goes.
 */
export function listTicketDocuments(workspace: Workspace): TicketDocumentListing {
  const records: LoadedTicketDocumentRecord[] = [];
  const unreadable: UnreadableTicketDocumentsRecord[] = [];
  for (const ticketId of ticketFolderNamesIn(localStoreLayoutOf(workspace).ticketDocumentRecordsFolder)) {
    if (folderIsEmpty(ticketFolderOf(workspace, ticketId))) continue;
    const location = ticketDocumentRecordPathOf(workspace, ticketId);
    const unreadableEntry = (problem: UnreadableTicketDocumentsProblem, entryLocation: string): UnreadableTicketDocumentsRecord => ({
      record: 'ticket-documents', key: ticketId, location: entryLocation, problem, line: 0
    });
    const reading = new TicketDocumentsFileIngestion(location).read();
    if (reading.verdict === 'malformed') {
      unreadable.push(unreadableEntry(reading.problem, location));
      continue;
    }
    if (reading.record.ticketId !== ticketId) {
      unreadable.push(unreadableEntry({
        code: 'folder-name-names-another-ticket', field: 'ticketId', ticketIdInFolderName: ticketId, storedTicketId: reading.record.ticketId
      }, location));
      continue;
    }
    const textOfContentHash: Record<string, string> = {};
    const contentHashes = new Set(reading.record.documents.flatMap((document) => document.versions.map((version) => version.contentHash)));
    let missing: UnreadableTicketDocumentsRecord | null = null;
    for (const contentHash of contentHashes) {
      const versionLocation = ticketDocumentVersionPathOf(workspace, ticketId, contentHash);
      const version = TicketDocumentContentFile.read(versionLocation, contentHash);
      if (version.verdict === 'unreadable') {
        missing = unreadableEntry(version.problem, versionLocation);
        break;
      }
      textOfContentHash[contentHash] = version.text;
    }
    if (missing === null) records.push({ record: reading.record, textOfContentHash });
    else unreadable.push(missing);
  }
  return { records, unreadable };
}

/** Every record and version file `clear --all` removes with the tickets. */
export function everyTicketDocumentFilePathIn(workspace: Workspace): string[] {
  const { ticketDocumentRecordsFolder } = localStoreLayoutOf(workspace);
  return ticketFolderNamesIn(ticketDocumentRecordsFolder).flatMap((ticketId) => {
    const folder = join(ticketDocumentRecordsFolder, ticketId);
    try {
      return readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => join(folder, entry.name)).sort();
    } catch {
      return [];
    }
  });
}

/** After a clear of every ticket removed their files: each ticket's emptied folder, so a ticket id used again finds no folder in the way. */
export function removeEmptyTicketDocumentFolders(workspace: Workspace): void {
  for (const ticketId of ticketFolderNamesIn(localStoreLayoutOf(workspace).ticketDocumentRecordsFolder)) {
    const folder = ticketFolderOf(workspace, ticketId);
    if (!folderIsEmpty(folder)) continue;
    try {
      rmdirSync(folder);
    } catch {
      // A folder that cannot go stays: the listing passes over an empty one.
    }
  }
}
