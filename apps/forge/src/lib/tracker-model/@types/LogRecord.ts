/**
 * What the Board tells the log, as ids and values with no wording; the caller words it. Every record type is derived from
 * `src/lib/tracker-model/constants/LogRecordSchema.ts`, so a new kind is an entry there plus its wording in `src/adapters/utils/LogUtil.ts`.
 */
import type {
  HATCH_REFUSAL_STATUSES,
  LogFieldShape,
  LOG_RECORD_SCHEMA,
  LOG_RECORD_SUBJECT_IDS
} from '../constants/LogRecordSchema.ts';
import type { DecisionAnswer, DecisionKind }                     from './Decision.ts';
import type { GatePhase }                                        from './GatePhase.ts';
import type { GateProfileRunEnding }                             from './GateProfile.ts';
import type { IncidentDefaultCause, IncidentKind, IncidentMove } from './Incident.ts';
import type {
  GateOutcome,
  GateRunCacheReports,
  InterruptionCause,
  JobKind,
  JobOutcome,
  JobRole,
  JobStopMode,
  LandingKind,
  OverseerStopReason,
  PictureReference,
  PipelineStepEnding,
  PipelineStepKind
}                                                                        from './Job.ts';
import type { PipelineBilling }                                              from './Pipeline.ts';
import type { PipelineSetupMode, PipelineSetupStep, PipelineSetupStepState } from './PipelineSetup.ts';
import type { ReviewClaim, ReviewFinding, ReviewVerdict }                    from './ReviewRecord.ts';
import type {
  AgentPair,
  EntityAssigner,
  TicketPriority,
  TicketSize
}                                                                            from './Ticket.ts';
import type { OverseerState, ViewRange } from './TrackerProgress.ts';

export type HatchRefusalStatus = (typeof HATCH_REFUSAL_STATUSES)[number];

/** A refused relayed request's refusal detail, kept whole: the tracker model reads only its kind, and the Hatch writes it back unchanged. */
export type HatchRefusalDetail = Readonly<{ kind: string } & Record<string, unknown>>;

/** Who started a run of Flint's brain: the board's own page, or a client through the API with the token alone. */
export type FlintBrainStarter = 'bridge' | 'api';

export type FlintBrainEndedReason = 'time' | 'stopped' | 'usage-limit' | 'failed';

/** The states the retired Workflow dispatcher logged in its `dispatcher-set` records, which an older log still holds. */
export type RetiredDispatcherState = 'running' | 'finished' | 'stopped';

interface ValueOfFieldShape {
  'text':                     string;
  'task-id':                  number;
  'optional-text':            string;
  'priority':                 TicketPriority;
  'ticket-size':              TicketSize;
  'optional-size':            TicketSize;
  'agent-pair':               AgentPair;
  'ticket-ids':               readonly string[];
  'epic-keys':                readonly string[];
  'network-domains':          readonly string[];
  'review-round':             number;
  'chart-range':              ViewRange;
  'concurrency-limit':        number;
  'overseer-state':           OverseerState;
  'dispatcher-state':         RetiredDispatcherState;
  'dispatcher-run-id':        string | null;
  'check-command':            string | null;
  'count':                    number;
  'optional-count':           number;
  'review-bar-round':         number;
  'review-verdict':           ReviewVerdict;
  'review-claims':            readonly ReviewClaim[];
  'review-findings':          readonly ReviewFinding[];
  'nullable-text':            string | null;
  'job-kind':                 JobKind;
  'job-role':                 JobRole | null;
  'job-outcome':              JobOutcome;
  'interruption-cause':       InterruptionCause;
  'watcher-instance':         number;
  'permission-names':         readonly string[];
  'overseer-stop-reason':     OverseerStopReason;
  'job-stop-mode':            JobStopMode;
  'decision-kind':            DecisionKind;
  'decision-answer':          DecisionAnswer;
  'incident-kind':            IncidentKind;
  'incident-move':            IncidentMove;
  'incident-default-cause':   IncidentDefaultCause;
  'gate-outcome':             GateOutcome;
  'file-paths':               readonly string[];
  'gate-phase':               GatePhase;
  'gate-names':               readonly string[];
  'landing-kind':             LandingKind;
  'flag':                     boolean;
  'optional-flag':            boolean;
  'optional-cost-usd':        number;
  'optional-pictures':        readonly PictureReference[];
  'optional-ticket-ids':      readonly string[];
  'optional-refusal-status':  HatchRefusalStatus;
  'optional-refusal-detail':  HatchRefusalDetail;
  'optional-cache-reports':   GateRunCacheReports;
  'pipeline-step-kind':       PipelineStepKind;
  'optional-gate-phase':      GatePhase;
  'pipeline-step-ending':     PipelineStepEnding;
  'setup-mode':               PipelineSetupMode;
  'billing-mode':             PipelineBilling['mode'];
  'setup-step':               PipelineSetupStep;
  'setup-step-state':         PipelineSetupStepState;
  'setup-steps':              readonly PipelineSetupStep[];
  'setup-item-ids':           readonly string[];
  'draft-fields':             readonly string[];
  'gate-profile-ending':      GateProfileRunEnding;
  'flint-brain-starter':      FlintBrainStarter;
  'flint-brain-ended-reason': FlintBrainEndedReason;
  'entity-assigner':          EntityAssigner;
}

type Schema = typeof LOG_RECORD_SCHEMA;

export type LogRecordKind = keyof Schema;

type FieldShapes = Readonly<Record<string, LogFieldShape>>;

type OptionalFieldShape =
  | 'optional-text'
  | 'optional-size'
  | 'optional-count'
  | 'optional-flag'
  | 'optional-cost-usd'
  | 'optional-pictures'
  | 'optional-ticket-ids'
  | 'optional-refusal-status'
  | 'optional-refusal-detail'
  | 'optional-cache-reports'
  | 'optional-gate-phase';

type OptionalFieldNames<Shapes extends FieldShapes> = { [Name in keyof Shapes]: Shapes[Name] extends OptionalFieldShape ? Name : never }[keyof Shapes];

type Flattened<Value> = { [Key in keyof Value]: Value[Key] };

type ValuesOfShapes<Shapes extends FieldShapes> = Flattened<
  & { [Name in Exclude<keyof Shapes, OptionalFieldNames<Shapes>>]: ValueOfFieldShape[Shapes[Name]] }
  & { [Name in OptionalFieldNames<Shapes>]?: ValueOfFieldShape[Shapes[Name]] }
>;

type FieldsOfShapes<Shapes extends FieldShapes> = [keyof Shapes] extends [never] ? Record<string, never> : ValuesOfShapes<Shapes>;

export type LogRecordFieldsOf<Kind extends LogRecordKind> = FieldsOfShapes<Schema[Kind]['fields']>;

type IdsOf<Kind extends LogRecordKind> = ValuesOfShapes<(typeof LOG_RECORD_SUBJECT_IDS)[Schema[Kind]['subject']]>;

export type LogRecordContent = {
  [Kind in LogRecordKind]: Flattened<{ kind: Kind } & IdsOf<Kind> & { fields: LogRecordFieldsOf<Kind> }>
}[LogRecordKind];

export type AgentUsage = LogRecordFieldsOf<'agent-stopped'>;

export type LogRecord = LogRecordContent & { at: string };

export type HatchAppliedRecord = Extract<LogRecord, { kind: 'hatch-applied' }>;
