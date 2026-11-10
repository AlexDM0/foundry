/**
 * One control a person, a UI or a relayed session can issue, as data: the only shape `src/services/control/ControlService.ts` applies.
 * Every value is plain JSON, so a command survives a Hatch file or an HTTP body unchanged; a body or request file is read before the
 * command is built, which carries its text. A ticket is named as it was written (`3`, `003`, `#3`), resolved inside the hold.
 */
import type { DecisionAnswerForm }                           from '../../lib/tracker-model/@types/Decision.ts';
import type { DraftNoteKind, DraftQuestionAsking }           from '../../lib/tracker-model/@types/Draft.ts';
import type { JobStopMode }                                  from '../../lib/tracker-model/@types/Job.ts';
import type { PipelineApproval, PipelineGate, PipelineStep } from '../../lib/tracker-model/@types/Pipeline.ts';
import type {
  AgentEffort,
  AgentModel,
  TicketPriority,
  TicketSize,
  TicketType
} from '../../lib/tracker-model/@types/Ticket.ts';

export type ListEdit = 'replace' | 'add' | 'remove';

export type WorktreeRepairStep = 'prune' | 'reinstall' | 'recreate' | 'unlock';

/**
 * What the Overseer stamps on a ticket its Hatch filed: the filing job, from the Hatch folder's job record, and, on a worker's finding,
 * the tickets of that job (the finders), which the finding waits for.
 */
export interface FilingAdmission {
  filedByJob:       string;
  finderTicketIds?: string[];
}

export type ControlCommand =
  | {
    kind:          'ticket-add';
    title:         string;
    type:          TicketType;
    priority?:     TicketPriority;
    size?:         TicketSize;
    model?:        AgentModel;
    effort?:       AgentEffort;
    group?:        string;
    dependsOn:     string[];
    epics:         string[];
    network:       string[];
    introducedBy:  string | null;
    foundInReview: string | null;
    /** Null files the ticket template's body. */
    bodyText:      string | null;
    /** Set only by `Bouncer`'s admission of a relayed filing, never by a request: a request carrying it is refused. */
    admission?:    FilingAdmission;
  }
  | {
    kind:              'ticket-edit';
    ticketReference:   string;
    title?:            string;
    /** Null leaves the body as it is. */
    bodyText:          string | null;
    appendsBody:       boolean;
    allowsPastPending: boolean;
  }
  | { kind: 'ticket-depends'; ticketReference: string; edit: ListEdit; ticketIds: string[] }
  | { kind: 'ticket-priority'; ticketReference: string; priority: TicketPriority }
  | { kind: 'ticket-epic'; ticketReference: string; edit: ListEdit; epicKeys: string[] }
  | {
    kind:            'ticket-abandon';
    ticketReference: string;
    reason?:         string;
    branch?:         string;
    commit?:         string;
    tokens?:         number;
  }
  | { kind: 'ticket-ready'; ticketReferences: string[] }
  /** The filer's close of its drafts, judged by the board's ticket review switch. */
  | { kind: 'ticket-submit'; ticketReferences: string[] }
  /** Holds `parked:<kind>` (`parked:user` with no incident) and opens a `parked` decision; `reason` is what User should know. */
  | { kind: 'ticket-park'; ticketReference: string; reason: string; incidentId?: string }
  | { kind: 'incident-answer'; incidentId: string; text: string }
  | { kind: 'incident-note'; incidentId: string; text: string }
  | { kind: 'incident-escalate'; incidentId: string }
  | { kind: 'ticket-network'; ticketReference: string; domains: string[] }
  | { kind: 'ticket-hold'; ticketReference: string; reason: string }
  | { kind: 'ticket-unhold'; ticketReference: string }
  | { kind: 'epic-add'; key: string; title: string; bodyText: string }
  | { kind: 'draft-open'; title: string; request: string; owner: string }
  | { kind: 'draft-claim'; draftId: string; owner: string; forces: boolean }
  | { kind: 'draft-release'; draftId: string }
  | { kind: 'draft-note'; draftId: string; text: string; noteKind: DraftNoteKind }
  | { kind: 'draft-ask'; draftId: string; asking: DraftQuestionAsking }
  | { kind: 'draft-answer'; draftId: string; questionId: string; answer: string }
  | { kind: 'draft-drop'; draftId: string; itemId: string }
  | { kind: 'draft-close'; draftId: string; ticketReferences: string[] }
  | { kind: 'draft-abandon'; draftId: string; reason: string }
  | { kind: 'decision-answer'; decisionId: string; answer: DecisionAnswerForm }
  | { kind: 'overseer-pause' }
  | { kind: 'overseer-resume' }
  /** Runtime only: sent to the live Overseer, which stops; the board is never changed by it. */
  | { kind: 'overseer-stop'; now: boolean }
  /** Runtime only: sent to the live Overseer, which hands the board to a successor on the code on disk. */
  | { kind: 'overseer-restart'; now: boolean }
  | { kind: 'job-stop'; jobId: string; mode: Exclude<JobStopMode, 'fresh'> }
  /** `incidentId` names the incident the move handles, in the same hold; the orchestrator must name one. */
  | { kind: 'job-fresh'; jobId: string; incidentId?: string }
  | { kind: 'job-stop-all'; mode: Exclude<JobStopMode, 'fresh'> }
  /**
   * Code-implemented repairs of a ticket's worktree (design section 8.3): `git worktree prune`, the install line rerun by the next launch,
   * the worktree recreated from its branch after its changes are saved, a stale `index.lock` removed. `incidentId` as on `job-fresh`.
   */
  | { kind: 'worktree-repair'; ticketReference: string; step: WorktreeRepairStep; incidentId?: string }
  | { kind: 'gate-retry'; jobId: string; incidentId?: string }
  | { kind: 'job-message'; jobId: string; text: string; incidentId?: string }
  | { kind: 'intake-start'; text: string }
  | { kind: 'onboarder-advise' }
  /** Relayed by a product owner without `jobId`: the role policy stamps its own job, from the Hatch folder. */
  | { kind: 'intake-close'; jobId?: string; proposedDraftSets: string[][] }
  /** The product owner's short title for its intake; relayed without `jobId` like `intake-close`. */
  | { kind: 'intake-title'; jobId?: string; title: string }
  | { kind: 'concurrency-set'; limit: number }
  | { kind: 'pipeline-prepare-step-set'; step: PipelineStep }
  | { kind: 'pipeline-gate-add'; gate: PipelineGate }
  | { kind: 'pipeline-gates-none' }
  | { kind: 'pipeline-gate-remove'; name: string }
  | { kind: 'pipeline-approval-set'; approval: PipelineApproval; on: boolean }
  /** With merge approval on: User's accept of a ticket waiting for merge, refused unless git predicts a clean merge into its target. */
  | { kind: 'merge-accept'; ticketReference: string }
  /** With merge approval on: the target merged into the ticket's worktree in the hold, with no Airlock; a conflict is aborted. */
  | { kind: 'merge-update'; ticketReference: string };

export type ControlCommandKind = ControlCommand['kind'];

export type ControlCommandOf<Kind extends ControlCommandKind> = Extract<ControlCommand, { kind: Kind }>;
