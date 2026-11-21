/**
 * The shape progress.json is stored in, declared field by field rather than derived from the model, so a model change breaks the mappers'
 * compile instead of silently changing the format.
 */
import type { DecisionAsker, DecisionKind } from '../../../lib/tracker-model/@types/Decision.ts';
import type { GatePhase }                   from '../../../lib/tracker-model/@types/GatePhase.ts';
import type { IncidentKind, IncidentMove }  from '../../../lib/tracker-model/@types/Incident.ts';
import type {
  InterruptionCause,
  JobIntake,
  JobKind,
  JobOutcome,
  JobRole,
  JobState,
  JobStopMode,
  AirlockPhase
}                                             from '../../../lib/tracker-model/@types/Job.ts';
import type { TaskStatus, TicketStageName }   from '../../../lib/tracker-model/@types/Task.ts';
import type { HephaestusState, ViewRange }    from '../../../lib/tracker-model/@types/TrackerProgress.ts';
import type { CURRENT_PROGRESS_FILE_VERSION } from '../constants/ProgressFileVersions.ts';

export interface StoredTaskPhase {
  status: TaskStatus;
  at:     string;
}

export interface StoredTask {
  id:              number;
  name:            string;
  status:          TaskStatus;
  start:           string | null;
  end:             string | null;
  owner:           string;
  note:            string;
  ticket:          string | null;
  tokens:          number | null;
  reviewed?:       string;
  reviewRound?:    number;
  history?:        StoredTaskPhase[];
  agent?:          string;
  reviewOf?:       string;
  reviewBarRound?: number;
  pipelineHash?:   string;
  pipelineHashes?: Record<string, string>;
  greenPhase?:     GatePhase;
  greenTree?:      string;
  mergeQueued?:    true;
  mergeAccepted?:  true;
  stage?:          StoredTicketStage;
  seals?:          Record<string, string>;
  packageReturns?: number;
}

export interface StoredTicketStage {
  name:   TicketStageName;
  entity: string;
}

export interface StoredJobEventCursor {
  instance: number;
  sequence: number;
}

export interface StoredAirlock {
  target:    string;
  targetTip: string;
  branchTip: string;
  phase:     AirlockPhase;
}

export interface StoredOptionNote {
  label:             string;
  touches?:          string[];
  tradeOff?:         string;
  acceptanceEffect?: string;
}

export interface StoredQuestionOptionNotes {
  question: string;
  options:  StoredOptionNote[];
}

export interface StoredJob {
  id:                  string;
  kind:                JobKind;
  role:                JobRole | null;
  ticketIds:           string[];
  parentJobId:         string | null;
  attempt:             number;
  target:              string | null;
  state:               JobState;
  interruption?:       InterruptionCause;
  childInstance:       number;
  eventCursor:         StoredJobEventCursor;
  answeredRequestIds:  string[];
  crashResumes:        number;
  airlock?:            StoredAirlock;
  stopRequest?:        JobStopMode;
  intake?:             JobIntake;
  pendingOptionNotes?: StoredQuestionOptionNotes[];
  outcome?:            JobOutcome;
  entity?:             string;
  stage?:              number;
}

export interface StoredProgressFile {
  version:                   typeof CURRENT_PROGRESS_FILE_VERSION;
  trackerId:                 string;
  project:                   string;
  startedAt:                 string;
  view:                      ViewRange;
  nextTaskId:                number;
  concurrencyLimit?:         number;
  hephaestusState?:          HephaestusState;
  nextDraftId?:              number;
  nextSetupId?:              number;
  nextJobId?:                number;
  jobs?:                     StoredJob[];
  nextDecisionId?:           number;
  decisions?:                StoredDecision[];
  nextIncidentId?:           number;
  incidents?:                StoredIncident[];
  hephaestusFirstStartedAt?: string;
  branchNamespace?:          string;
  tasks:                     StoredTask[];
  needs?:                    StoredDeclaredNeed[];
}

export interface StoredDeclaredNeed {
  jobId:     string;
  ticketIds: string[];
  entity:    string;
  title:     string;
  body:      string;
}

export interface StoredDecisionQuestionOption {
  label:             string;
  description:       string;
  isRecommended:     boolean;
  touches?:          string[];
  tradeOff?:         string;
  acceptanceEffect?: string;
}

export interface StoredDecisionQuestion {
  question:    string;
  header:      string;
  multiSelect: boolean;
  options:     StoredDecisionQuestionOption[];
}

export interface StoredDecision {
  id:        string;
  kind:      DecisionKind;
  ticketIds: string[];
  jobId:     string | null;
  askedBy:   DecisionAsker;
  requestId: string | null;
  questions: StoredDecisionQuestion[];
  context:   string;
  openedAt:  string;
}

export interface StoredIncidentDeliveryTurn {
  jobId:        string;
  chatSequence: number;
}

export interface StoredIncident {
  id:              string;
  kind:            IncidentKind;
  ticketIds:       string[];
  jobId:           string | null;
  facts:           Record<string, string>;
  defaultMove:     IncidentMove;
  deliveredInTurn: StoredIncidentDeliveryTurn | null;
  openedAt:        string;
}
