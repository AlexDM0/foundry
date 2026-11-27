/** The local files adapter's record allocation: a new ticket's id and file, the file of each ticket the hold holds, and of each single record. */
import type { Board }       from '../../lib/tracker-model/Board.ts';
import { OperationRefusal } from '../../shared/OperationRefusal.ts';
import type {
  RecordKind,
  RecordReference,
  UnreadableRecord,
  UnreadableRecords
} from './@types/BoardRecords.ts';
import type { RecordAllocation } from './BoardTransaction.ts';
import { draftFilePathOf }       from './DraftStore.ts';
import { epicFilePathOf }        from './EpicStore.ts';
import { localStoreLayoutOf }    from './LocalStoreLayout.ts';
import { createTicket }          from './TicketStore.ts';
import type { Workspace }        from './Workspace.ts';

/** An unreadable record is no part of the Board, so without this refusal a new record of its key would overwrite whatever broke it. */
function refuseAnUnreadableRecordOfKey(unreadable: readonly UnreadableRecord[], key: string, filePath: string, record: Exclude<RecordKind, 'ticket'>): void {
  if (unreadable.some((unreadableRecord) => unreadableRecord.key === key)) {
    throw new OperationRefusal('refused', { kind: 'unreadable-file-in-the-way', filePath, record });
  }
}

/** Where the local files keep a record a board holds one of; the store's read side answers it too. */
export function singleRecordFilePathOf(workspace: Workspace, reference: RecordReference): string {
  const layout = localStoreLayoutOf(workspace);
  switch (reference.record) {
    case 'progress':             return layout.progressRecordPath;
    case 'pipeline':             return layout.pipelineRecordPath;
    case 'pipeline-setup':       return layout.pipelineSetupRecordPath;
    case 'gate-profiles':        return layout.gateProfilesRecordPath;
    case 'constitution-sources': return layout.constitutionSourcesRecordPath;
    case 'log':                  return layout.logRecordPath;
    case 'unfinished-write':     return layout.holdJournalPath;
  }
}

/** The transaction's allocation, and for the adapter alone the file each ticket of the hold is stored in. */
export interface LocalRecordAllocation extends RecordAllocation {
  /** Throws for a ticket neither listed at the hold's start nor allocated in it: the Board changed a ticket the store never held. */
  storedTicketLocationOf(ticketId: string): string;
}

/**
 * Built inside the hold after the Board is opened: the Board satisfies `TicketsSpentInHold`, so two tickets of one hold get two ids. Seeded
 * with the listing's ticket files, so a retitled ticket keeps the file it was read from.
 */
export function createLocalRecordAllocation(
  workspace: Workspace,
  board: Board,
  unreadableRecords: UnreadableRecords,
  listedTicketLocations: ReadonlyMap<string, string>,
): LocalRecordAllocation {
  const ticketLocations = new Map(listedTicketLocations);
  return {
    newTicket: (input) => {
      const created = createTicket(workspace, board, ticketLocations.values(), input);
      ticketLocations.set(created.ticket.frontmatter.id, created.location);
      return created.ticket;
    },
    requireEpicKeyIsFree: (epicKey) => {
      refuseAnUnreadableRecordOfKey(unreadableRecords.epics, epicKey, epicFilePathOf(workspace, epicKey), 'epic');
    },
    requireDraftKeyIsFree: (draftId) => {
      refuseAnUnreadableRecordOfKey(unreadableRecords.drafts, draftId, draftFilePathOf(workspace, draftId), 'draft');
    },
    locationOf:             (reference) => singleRecordFilePathOf(workspace, reference),
    storedTicketLocationOf: (ticketId) => {
      const location = ticketLocations.get(ticketId);
      if (location === undefined) throw new OperationRefusal('unrepaired', { kind: 'ticket-file-not-allocated', ticketId });
      return location;
    },
  };
}
