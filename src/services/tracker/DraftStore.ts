/**
 * The filing cabinet as a store: `D<n>.json` per open draft. Nothing here throws because a draft file is bad: a malformed file is a listing
 * entry, so one broken file cannot take down `status` or `render`.
 */
import { join }                     from 'node:path';
import { DraftFileIngestion }       from '../../adapters/drafts/DraftFileIngestion.ts';
import type { Draft }               from '../../lib/tracker-model/@types/Draft.ts';
import { listStoreFolder }          from './StoreFolderListing.ts';
import type { MalformedTicketFile } from './TicketStore.ts';
import type { Workspace }           from './Workspace.ts';

/** The same report a malformed ticket file makes; a JSON draft has no line to point at, so `line` is 0. */
export type MalformedDraftFile = MalformedTicketFile;

export interface DraftListing {
  drafts:    Draft[];
  malformed: MalformedDraftFile[];
}

const DRAFT_FILE_EXTENSION = '.json';

/** A draft is its file name: a file whose `id` says otherwise is listed as malformed. */
export function listDrafts(workspace: Workspace): DraftListing {
  const listing = listStoreFolder<Draft>({
    directory: workspace.draftsDirectory,
    extension: DRAFT_FILE_EXTENSION,
    keyField:  'id',
    readingOf: (filePath) => {
      const reading = new DraftFileIngestion(filePath).read();
      // A JSON draft has no line to point at.
      return reading.verdict === 'malformed' ? { verdict: 'malformed', reason: reading.reason, line: 0 } : { verdict: 'read', item: reading.draft, key: reading.draft.id };
    },
  });
  return { drafts: listing.items, malformed: listing.malformed };
}

export function draftFilePathOf(workspace: Workspace, draftId: string): string {
  return join(workspace.draftsDirectory, `${draftId}${DRAFT_FILE_EXTENSION}`);
}
