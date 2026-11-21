/**
 * The board's commands a view may send to `POST /api/v1/commands` from forge 1.21, under `controlVersion` 1, beside the control contract's
 * kinds: each kind with the payload types the contract declares itself. A draft edit is typed, addressed by its target as the forge's
 * draft names it, never as a field string.
 */
import type { EntityKey, GatePhase, TicketPriority } from '../constants/BoardVocabulary.ts';
import type {
  ConstitutionSourcesDocument,
  PipelineBillingDocument,
  PipelineDraftEditDocument,
  PipelineSetupStep
} from './BoardPipelineDocuments.ts';
import type { ForgeJobStopMode } from './ForgeControlCommand.ts';

/** `tasks-and-log` keeps the tickets; `everything` also deletes the tickets, the epics and the pictures. */
export type TrackerClearScope = 'tasks-and-log' | 'everything';

/** A chart axis: each bound a timestamp, `start`, `now` or a signed offset from now. */
export type ChartRangeRequest =
  | { readonly kind: 'automatic' }
  | { readonly kind: 'window'; readonly from: string; readonly to: string; readonly tickMinutes: number | null };

/** The chosen option letters, `a` or `ac` per entry, or free text. */
export type DecisionAnswerFormDocument =
  | { readonly form: 'letters'; readonly choices: readonly string[] }
  | { readonly form: 'text'; readonly text: string };

/** A picture uploaded to `POST /api/pictures` first: its id is the sha256 of its bytes, its name the file's. */
export interface PictureReferenceDocument {
  readonly pictureId: string;
  readonly name:      string;
}

export type ForgeBoardCommand =
  | { readonly kind: 'chart-range-set'; readonly range: ChartRangeRequest }
  | { readonly kind: 'decision-answer'; readonly decisionId: string; readonly answer: DecisionAnswerFormDocument }
  | {
    readonly kind:     'gate-profile-start';
    readonly setupId:  string | null;
    readonly gateName: string;
    readonly phase:    GatePhase;
    readonly entity?:  EntityKey;
  }
  | { readonly kind: 'gate-profile-stop'; readonly profileRunId: string }
  | { readonly kind: 'intake-close'; readonly jobId?: string; readonly proposedDraftSets: readonly (readonly string[])[] }
  | { readonly kind: 'intake-start'; readonly text: string; readonly pictures?: readonly PictureReferenceDocument[] }
  | { readonly kind: 'job-fresh'; readonly jobId: string; readonly incidentId?: string }
  | {
    readonly kind:        'job-message';
    readonly jobId:       string;
    readonly text:        string;
    readonly pictures?:   readonly PictureReferenceDocument[];
    readonly incidentId?: string;
  }
  | { readonly kind: 'job-stop'; readonly jobId: string; readonly mode: ForgeJobStopMode }
  | { readonly kind: 'merge-accept'; readonly ticketReference: string }
  | { readonly kind: 'merge-update'; readonly ticketReference: string }
  | { readonly kind: 'pipeline-agent-advise'; readonly entity?: EntityKey }
  | { readonly kind: 'pipeline-apply'; readonly setupId: string; readonly draftRevision: number; readonly resumesBoard: boolean }
  | { readonly kind: 'pipeline-apply-cancel'; readonly setupId: string }
  /** The board's switch for the Assistant; off also winds a live Assistant down at the end of its turn. */
  | { readonly kind: 'pipeline-assistant-set'; readonly on: boolean }
  | { readonly kind: 'pipeline-check'; readonly setupId: string }
  | {
    readonly kind:         'pipeline-constitution-edit';
    readonly setupId:      string;
    readonly revision:     number;
    readonly markdown?:    string;
    readonly draftedFrom?: ConstitutionSourcesDocument;
    readonly entity?:      EntityKey;
  }
  | { readonly kind: 'pipeline-draft-discard'; readonly setupId: string }
  | {
    readonly kind:          'pipeline-draft-edit';
    readonly setupId:       string;
    readonly draftRevision: number;
    readonly edits:         readonly PipelineDraftEditDocument[];
    readonly isACopy?:      true;
  }
  | { readonly kind: 'pipeline-draft-undo'; readonly setupId: string; readonly editId: string; readonly wholeBatch?: true }
  | { readonly kind: 'pipeline-setup-answer'; readonly setupId: string; readonly questionId: string; readonly answer: DecisionAnswerFormDocument }
  | { readonly kind: 'pipeline-setup-billing'; readonly setupId: string; readonly billing: PipelineBillingDocument }
  | { readonly kind: 'pipeline-setup-resume'; readonly setupId: string }
  | { readonly kind: 'pipeline-setup-start'; readonly billing: PipelineBillingDocument; readonly replacesUnreadablePipeline: boolean }
  | { readonly kind: 'pipeline-setup-start-over'; readonly setupId: string }
  | { readonly kind: 'pipeline-setup-step'; readonly setupId: string; readonly step: PipelineSetupStep; readonly move: 'continue' }
  | { readonly kind: 'pipeline-update-start'; readonly entity?: EntityKey }
  | { readonly kind: 'ticket-deliver-by-hand'; readonly ticketReference: string; readonly branch?: string; readonly commit?: string }
  | { readonly kind: 'ticket-hold'; readonly ticketReference: string; readonly reason: string }
  | { readonly kind: 'ticket-network'; readonly ticketReference: string; readonly domains: readonly string[] }
  | { readonly kind: 'ticket-park'; readonly ticketReference: string; readonly reason: string; readonly incidentId?: string }
  | { readonly kind: 'ticket-priority'; readonly ticketReference: string; readonly priority: TicketPriority }
  | { readonly kind: 'ticket-ready'; readonly ticketReferences: readonly string[] }
  | { readonly kind: 'ticket-unhold'; readonly ticketReference: string }
  | { readonly kind: 'tracker-clear'; readonly scope: TrackerClearScope };
