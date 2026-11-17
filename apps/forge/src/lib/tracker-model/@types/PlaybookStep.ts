/**
 * What the Playbook derives from the board and the Overseer's observations: each step a change `Board.followPlaybook` applies in
 * the hold, so a step lost to a crash is derived again on the next pass.
 */
import type { DecisionKind, DecisionQuestion }                              from './Decision.ts';
import type { IncidentDefaultCause, IncidentDeliveryTurn, IncidentOpening } from './Incident.ts';

export type ParkCause = 'failed-passes' | 'red-resumes-spent';

/** A decision code opens from the facts; its questions are worded by the caller, never by the policy. */
export interface DecisionDraft {
  kind:      DecisionKind;
  ticketIds: readonly string[];
  jobId:     string | null;
}

export interface DecisionWording {
  questions: readonly Readonly<DecisionQuestion>[];
  context:   string;
}

/** On a pipeline with entities, a launch of a ticket of an entity names the entity whose stage the job runs and the stage's number. */
export interface PlaybookLaunchStage {
  entity?: string;
  stage?:  number;
}

export type PlaybookStep =
  | { kind: 'launch-build'; ticketId: string; attempt: number; base: string } & PlaybookLaunchStage
  | { kind: 'launch-review'; ticketId: string; round: number; target: string } & PlaybookLaunchStage
  | { kind: 'resume-job'; jobId: string }
  // Past `JOB_RESUMES_BEFORE_FRESH` crash resumes, or a session that went down: ended `replaced`.
  | { kind: 'replace-job'; jobId: string }
  // A product owner replaced past the bound while its question is open waits for the answer with no process.
  | { kind: 'await-answer'; jobId: string }
  // A product owner past the bound whose questions are answered: a fresh session takes its drafts and the answers, never a resume.
  | { kind: 'refresh-intake'; jobId: string }
  // A review waiting `awaiting-answer` whose `waiver` decision User answered: the Overseer acts on the answers, as it needs the job folder.
  | { kind: 'act-on-waiver-answer'; jobId: string; answers: readonly string[] }
  | { kind: 'boot-assistant' }
  // An open decision of a kind that retired: the one-shot pipeline proposal.
  | { kind: 'withdraw-retired-decision'; decisionId: string }
  // `jobId` names a job interrupted on a red handoff with its resumes spent, which ends `failed` as its ticket parks.
  | { kind: 'park'; ticketId: string; cause: ParkCause; jobId?: string }
  // On a pipeline with entities: the ticket filed for a need of `ticketId` was abandoned, so it leaves its `dependsOn` and User decides.
  | { kind: 'release-abandoned-need'; ticketId: string; needTicketId: string }
  | { kind: 'open-decision'; decision: DecisionDraft }
  | { kind: 'open-incident'; incident: IncidentOpening }
  | { kind: 'default-incident'; incidentId: string; cause: IncidentDefaultCause }
  | { kind: 'pause-overseer'; cause: 'outage' }
  // A ticket a board slot would launch now, which waits because no machine-wide agent slot is free; it changes nothing.
  | { kind: 'await-machine-slot'; ticketId: string };

/** What the Overseer saw outside the board, passed in as values so the policy reaches no git, process or file. */
export interface PlaybookObservations {
  mainLine:                     string;
  /** A group ticket's work goes to this prefix followed by its group's name. */
  groupTargetPrefix:            string;
  installVersionChanged:        boolean;
  /** The targets whose committed CLAUDE.md still holds the managed block. */
  targetsHoldingManagedBlock:   readonly string[];
  /** The tickets whose branch changed agent configuration. */
  ticketIdsTouchingAgentConfig: readonly string[];
  /** The Assistant turns that closed, an incident delivered in one of them taking its default. */
  closedDeliveryTurns:          readonly IncidentDeliveryTurn[];
  /** The Assistant turns still open that reached their call budget: an incident delivered in one takes its default, cause `turn-budget`. */
  budgetSpentDeliveryTurns:     readonly IncidentDeliveryTurn[];
  /** The live Assistant's session has reached a `result`, which ends a run of failed boots. */
  assistantHasAnswered:         boolean;
  /** A sweep asks for one more boot past the failed-boot bound; never set in the pass a boot failed. */
  assistantBootRetryDue:        boolean;
  /** The machine-wide agent slots this Overseer reserved for the pass; absent where no machine limit applies. */
  machineAgentSlotsFree?:       number;
}
