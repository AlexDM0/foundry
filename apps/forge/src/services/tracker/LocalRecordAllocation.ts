/** The local files adapter's record allocation: a new ticket's id and file, a new epic's file, and the file of each single record. */
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
import { holdJournalFilePathOf } from './HoldJournal.ts';
import { createTicket }          from './TicketStore.ts';
import type { Workspace }        from './Workspace.ts';

/** An unreadable record is no part of the Board, so without this refusal a new record of its key would overwrite whatever broke it. */
function refuseAnUnreadableRecordOfKey(unreadable: readonly UnreadableRecord[], key: string, filePath: string, record: Exclude<RecordKind, 'ticket'>): void {
  if (unreadable.some((unreadableRecord) => unreadableRecord.key === key)) {
    throw new OperationRefusal('refused', { kind: 'unreadable-file-in-the-way', filePath, record });
  }
}

function singleRecordFilePathOf(workspace: Workspace, reference: RecordReference): string {
  switch (reference.record) {
    case 'progress':             return workspace.progressFilePath;
    case 'pipeline':             return workspace.pipelineFilePath;
    case 'pipeline-setup':       return workspace.pipelineSetupFilePath;
    case 'gate-profiles':        return workspace.gateProfilesFilePath;
    case 'constitution-sources': return workspace.constitutionSourcesFilePath;
    case 'log':                  return workspace.logFilePath;
    case 'unfinished-write':     return holdJournalFilePathOf(workspace);
  }
}

/** Built inside the hold after the Board is opened: the Board satisfies `TicketsSpentInHold`, so two tickets of one hold get two ids. */
export function createLocalRecordAllocation(workspace: Workspace, board: Board, unreadableRecords: UnreadableRecords): RecordAllocation {
  return {
    newTicket:       (input) => createTicket(workspace, board, input),
    newEpicLocation: (epicKey) => {
      const filePath = epicFilePathOf(workspace, epicKey);
      refuseAnUnreadableRecordOfKey(unreadableRecords.epics, epicKey, filePath, 'epic');
      return filePath;
    },
    requireDraftKeyIsFree: (draftId) => {
      refuseAnUnreadableRecordOfKey(unreadableRecords.drafts, draftId, draftFilePathOf(workspace, draftId), 'draft');
    },
    locationOf: (reference) => singleRecordFilePathOf(workspace, reference),
  };
}
