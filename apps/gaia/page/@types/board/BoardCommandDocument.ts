/**
 * The body of a command a view of a forge's board posts to Gaia (`POST /api/v1/forges/<trackerId>/commands`): each kind under the forge's
 * own kind name, so a view reads as the Bridge's, with Gaia's payload. No view applies a command before the forge answers.
 */
import type { PAGE_CONTRACT_VERSIONS }                                                         from '../../../src/shared/constants/PageContractVersions.ts';
import type { BoardBillingDocument, BoardConstitutionSourcesDocument, BoardDraftEditDocument } from './BoardPipelineDocuments.ts';
import type {
  BoardGatePhase,
  BoardJobStopMode,
  BoardSetupStep,
  BoardTicketPriority,
} from './BoardVocabulary.ts';

/** A chart axis: each bound a timestamp, `start`, `now` or a signed offset from now. */
export type BoardChartRangeDocument =
  | { readonly kind: 'automatic' }
  | { readonly kind: 'window'; readonly from: string; readonly to: string; readonly tickMinutes: number | null };

/** The chosen option letters, one entry per question, or free text. */
export type BoardAnswerFormDocument =
  | { readonly form: 'letters'; readonly choices: readonly string[] }
  | { readonly form: 'text'; readonly text: string };

/** A picture uploaded first: its id, the sha256 of its bytes, and the file's name. */
export interface BoardPictureReferenceDocument {
  readonly pictureId: string;
  readonly name:      string;
}

/** One job, one ticket as it is written, or every job that waits for an instruction. */
export type BoardResumeTargetDocument = { readonly jobId: string } | { readonly ticketReference: string } | 'all';

export type BoardTrackerClearScope = 'tasks-and-log' | 'everything';

export type BoardCommandDocument = { readonly boardCommandVersion: typeof PAGE_CONTRACT_VERSIONS.gaiaBoardCommand } & (
  | { readonly kind: 'overseer-pause' }
  | { readonly kind: 'overseer-resume' }
  | { readonly kind: 'overseer-stop'; readonly now: boolean }
  | { readonly kind: 'overseer-restart'; readonly now: boolean }
  | { readonly kind: 'concurrency-set'; readonly limit: number }
  | { readonly kind: 'flint-brain-start' }
  | { readonly kind: 'flint-brain-stop' }
  | { readonly kind: 'interrupted-work-resume'; readonly target: BoardResumeTargetDocument }
  | { readonly kind: 'chart-range-set'; readonly range: BoardChartRangeDocument }
  | { readonly kind: 'decision-answer'; readonly decisionId: string; readonly answer: BoardAnswerFormDocument }
  | {
    readonly kind:     'gate-profile-start';
    readonly setupId:  string | null;
    readonly gateName: string;
    readonly phase:    BoardGatePhase;
    readonly entity:   string | null;
  }
  | { readonly kind: 'gate-profile-stop'; readonly profileRunId: string }
  | { readonly kind: 'intake-close'; readonly jobId: string | null; readonly proposedDraftSets: readonly (readonly string[])[] }
  | { readonly kind: 'intake-start'; readonly text: string; readonly pictures: readonly BoardPictureReferenceDocument[] }
  | { readonly kind: 'job-fresh'; readonly jobId: string; readonly incidentId: string | null }
  | {
    readonly kind:       'job-message';
    readonly jobId:      string;
    readonly text:       string;
    readonly pictures:   readonly BoardPictureReferenceDocument[];
    readonly incidentId: string | null;
  }
  | { readonly kind: 'job-stop'; readonly jobId: string; readonly mode: BoardJobStopMode }
  | { readonly kind: 'merge-accept'; readonly ticketId: string }
  | { readonly kind: 'merge-update'; readonly ticketId: string }
  | { readonly kind: 'pipeline-agent-advise'; readonly entity: string | null }
  | { readonly kind: 'pipeline-apply'; readonly setupId: string; readonly draftRevision: number; readonly resumesBoard: boolean }
  | { readonly kind: 'pipeline-apply-cancel'; readonly setupId: string }
  | { readonly kind: 'pipeline-check'; readonly setupId: string }
  | {
    readonly kind:        'pipeline-constitution-edit';
    readonly setupId:     string;
    readonly revision:    number;
    readonly markdown:    string | null;
    readonly draftedFrom: BoardConstitutionSourcesDocument | null;
    readonly entity:      string | null;
  }
  | { readonly kind: 'pipeline-draft-discard'; readonly setupId: string }
  | {
    readonly kind:          'pipeline-draft-edit';
    readonly setupId:       string;
    readonly draftRevision: number;
    readonly edits:         readonly BoardDraftEditDocument[];
    readonly isACopy:       boolean;
  }
  | { readonly kind: 'pipeline-draft-undo'; readonly setupId: string; readonly editId: string; readonly wholeBatch: boolean }
  | { readonly kind: 'pipeline-setup-answer'; readonly setupId: string; readonly questionId: string; readonly answer: BoardAnswerFormDocument }
  | { readonly kind: 'pipeline-setup-billing'; readonly setupId: string; readonly billing: BoardBillingDocument }
  | { readonly kind: 'pipeline-setup-resume'; readonly setupId: string }
  | { readonly kind: 'pipeline-setup-start'; readonly billing: BoardBillingDocument; readonly replacesUnreadablePipeline: boolean }
  | { readonly kind: 'pipeline-setup-start-over'; readonly setupId: string }
  | { readonly kind: 'pipeline-setup-step'; readonly setupId: string; readonly step: BoardSetupStep; readonly move: 'continue' }
  | { readonly kind: 'pipeline-update-start'; readonly entity: string | null }
  | { readonly kind: 'ticket-deliver-by-hand'; readonly ticketId: string; readonly branch: string | null; readonly commit: string | null }
  | { readonly kind: 'ticket-hold'; readonly ticketId: string; readonly reason: string }
  | { readonly kind: 'ticket-network'; readonly ticketId: string; readonly domains: readonly string[] }
  | { readonly kind: 'ticket-park'; readonly ticketId: string; readonly reason: string; readonly incidentId: string | null }
  | { readonly kind: 'ticket-priority'; readonly ticketId: string; readonly priority: BoardTicketPriority }
  | { readonly kind: 'ticket-ready'; readonly ticketIds: readonly string[] }
  | { readonly kind: 'ticket-unhold'; readonly ticketId: string }
  | { readonly kind: 'tracker-clear'; readonly scope: BoardTrackerClearScope }
);

export type BoardCommandDocumentKind = BoardCommandDocument['kind'];
