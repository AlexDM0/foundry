/**
 * What runs next, derived from the board and Hephaestus's observations alone: which jobs launch, resume or are replaced, which tickets park,
 * which decisions and incidents open and which incidents take their default. Pure: it reads no clock, file or process, and every count it
 * acts on is read from the log, so a restart derives the same steps.
 */
import type { Decision } from './@types/Decision.ts';
import type { Incident } from './@types/Incident.ts';
import type {
  InterruptionCause,
  Job,
  JobKind,
  JobOutcome,
  JobRole
} from './@types/Job.ts';
import type { LifecycleLimits, LifecycleThresholds } from './@types/LifecycleLimits.ts';
import type { LogRecord }                            from './@types/LogRecord.ts';
import type { EntityKey }                            from './@types/Pipeline.ts';
import type { PlaybookObservations, PlaybookStep }   from './@types/PlaybookStep.ts';
import type { TicketStage, TicketStageName }         from './@types/Task.ts';
import type { TicketPriority, TicketStatus }         from './@types/Ticket.ts';
import type {
  DocumentStanding,
  LoadedTicketDocumentRecord,
  TicketDocument,
  TicketDocumentKind
} from './@types/TicketDocument.ts';
import type { HephaestusState }                                                                  from './@types/TrackerProgress.ts';
import { CRASH_INTERRUPTION_CAUSES, FORCED_STOP_REFUSED_INTERRUPTION, HANDOFF_RED_INTERRUPTION } from './constants/JobStates.ts';
import { RESUME_POLICY_OF_CAUSE, type ResumePolicy }                                             from './constants/ResumePolicy.ts';
import { TICKET_STATUSES_NO_AGENT_HAS_PICKED_UP, TICKET_STATUSES_THAT_CLOSE_A_TICKET }           from './constants/Statuses.ts';
import { ConcurrencyUtil }                                                                       from './utils/ConcurrencyUtil.ts';
import { DocumentAgentJobUtil }                                                                  from './utils/DocumentAgentJobUtil.ts';
import { FailedPassUtil }                                                                        from './utils/FailedPassUtil.ts';
import { LaunchSlotUtil }                                                                        from './utils/LaunchSlotUtil.ts';
import { TicketDefaultsUtil }                                                                    from './utils/TicketDefaultsUtil.ts';
import { TicketDependencyUtil }                                                                  from './utils/TicketDependencyUtil.ts';
import { TicketDocumentStandingUtil }                                                            from './utils/TicketDocumentStandingUtil.ts';
import { TicketDocumentVersionUtil }                                                             from './utils/TicketDocumentVersionUtil.ts';
import { TicketStageUtil }                                                                       from './utils/TicketStageUtil.ts';

export interface PlaybookTicket {
  id:           string;
  status:       TicketStatus;
  priority?:    TicketPriority;
  dependsOn?:   readonly string[];
  hold?:        string;
  group?:       string;
  /** A passed review queued it to land: it waits for its Airlock, never for another review. */
  mergeQueued?: boolean;
  /** The job that filed it; a need's ticket names the build job of the ticket that waits on it. */
  filedByJob?:  string;
  /** On a pipeline with entities: the entity it belongs to, whose build and review its jobs run while it crosses into no package. */
  entity?:      string;
  /** The stage its row stores once it crosses into a whitelisted package: its next launch comes from the stage, not from its status. */
  stage?:       TicketStage;
}

/** The decisions naming a ticket that hold every launch on it until User answers. */
const TICKET_HOLDING_DECISION_KINDS: readonly Decision['kind'][] = [
  'waiver', 'branch-touches-agent-config', 'forced-stop-refused', 'budget-reached', 'need-for-root', 'need-closes-circle', 'need-abandoned', 'work-in-other-entity'
];

/** The decisions a crossing ticket's package stages open, which hold it the same way. */
const CROSSING_HOLDING_DECISION_KINDS: readonly Decision['kind'][] = ['package-refused', 'second-return', 'dependent-broken', 'whitelist-removed-mid-crossing'];

/** What a job that waits to run again waits for; `nothing` is a job that resumes by itself at the next pass. */
export type ResumeWait = 'instruction' | 'answer' | 'decision' | 'nothing' | 'never';

export interface PlaybookFacts {
  tickets:                     readonly PlaybookTicket[];
  jobs:                        readonly Readonly<Job>[];
  decisions:                   readonly Readonly<Decision>[];
  incidents:                   readonly Readonly<Incident>[];
  /** The log as stored, then what this hold logged. */
  logRecords:                  readonly LogRecord[];
  readinessPositionByTicketId: ReadonlyMap<string, number>;
  concurrencyLimit:            number;
  hephaestusState:             HephaestusState;
  pipelineIsSet:               boolean;
  /** The board's switch: off boots no Assistant, and every incident no open turn holds takes its default. */
  assistantIsOn:               boolean;
  /** The pipeline has a `review` phase; without one no reviewer is ever launched, and a gated build queues to merge. */
  reviewIsSet:                 boolean;
  /**
   * The pipeline names entities: a ticket with an unsettled dependency launches nothing whatever its status, and a need's ticket runs at
   * the highest priority of the tickets that wait on it.
   */
  pipelineHasEntities:         boolean;
  /** The entities whose own pipeline has a `review` phase: only these launch a reviewer for a review stage of a crossing ticket. */
  entitiesWithReview:          readonly string[];
  /** Each entity's cap: the most of its jobs that hold a slot at once, under `concurrencyLimit`. An entity without one has the board's limit alone. */
  concurrencyByEntity:         Readonly<Record<EntityKey, number>>;
  /** The spec and plan of each ticket in the spec-then-plan route, as their agents' launches read them; absent reads as none. */
  ticketDocuments?:            readonly PlaybookTicketDocuments[];
  observations:                PlaybookObservations;
}

/** What a document agent's launch reads of one document. */
export interface PlaybookDocumentFacts {
  hasVersion:                  boolean;
  standing:                    DocumentStanding;
  /** A message waits in its queue for the document's agent. */
  messageWaits:                boolean;
  /** For a plan: an edit its agent proposed for the spec's approved version is still open. */
  openProposalForApprovedSpec: boolean;
}

export interface PlaybookTicketDocuments {
  ticketId:           string;
  spec:               PlaybookDocumentFacts;
  plan:               PlaybookDocumentFacts;
  /** The spec version approved at its head; `null` while none is. */
  approvedSpecNumber: number | null;
}

/** The jobs whose spent red resumes park their ticket; an Airlock agent's Airlock parks its own, aborting the merge. */
const TICKET_WORK_JOB_KINDS: readonly JobKind[] = ['review', 'build'];

/** The Assistant answers incidents and holds no work, so one that went down is never resumed: a fresh one boots instead. */
const REPLACED_SESSION_JOB_KINDS: readonly JobKind[] = ['assistant'];

/**
 * A child gone with the machine or the forge itself, found gone at the next start. That start boots a fresh Assistant at once, while an
 * Assistant that ended on its own outage or lease end waits for User's resume as any job does.
 */
const FORGE_ENDING_INTERRUPTION_CAUSES: readonly InterruptionCause[] = ['reboot', 'forge-stopped', 'forge-crashed'];

/** The cause a resume reads for an interrupted job that recorded none, as `Jobs.moveJob` counts it. */
const UNRECORDED_INTERRUPTION_CAUSE: InterruptionCause = 'talos-lost';

/** A job ended with a report code verified, which breaks a run of crashes across tickets. */
const VERIFIED_OUTCOMES: readonly JobOutcome[] = ['built', 'reviewed', 'round-granted', 'does-not-hold', 'resolved', 'landed', 'integrated', 'refreshed'];

const PRIORITY_RANK: Readonly<Record<TicketPriority, number>> = { high: 0, normal: 1, low: 2 };

/**
 * Within a priority rank a review goes first (it holds finished work), then the next build stage of a ticket between stages, so started
 * work finishes first (E71), then a rebuild, then a ready build.
 */
const WORK_PHASE_RANK = {
  review: 0, stage: 1, rebuild: 2, build: 3
} as const;

/** The stages of a crossing ticket a reviewer runs; a builder runs every other one. */
const REVIEW_STAGE_NAMES: readonly TicketStageName[] = ['package-review', 'review'];

type WorkPhase = keyof typeof WORK_PHASE_RANK;

/** A ticket with no readiness position ranks before every positioned one, as the ready list orders it. */
const UNRECORDED_READINESS_POSITION = -1;

interface Candidate {
  ticket: PlaybookTicket;
  phase:  WorkPhase;
  step:   PlaybookStep;
}

interface JobLaunch {
  kind:      JobKind;
  role:      JobRole | null;
  ticketIds: readonly string[];
  attempt:   number;
  entity?:   string;
  stage?:    number;
}

/** What a launch on a pipeline with entities names: the entity whose stage the job runs, and the stage's number. */
interface LaunchStage {
  entity: string;
  stage:  number;
}

type JobLaunchesByJobId = ReadonlyMap<string, JobLaunch>;

/** The log with its launches indexed: every count over a ticket's past jobs reads it. */
interface IndexedLog {
  readonly logRecords:      readonly LogRecord[];
  readonly launchesByJobId: JobLaunchesByJobId;
}

/** What the next launch on a ticket carries: its build's attempt and its review's round. */
export interface NextLaunchNumbers {
  buildAttempt: number;
  reviewRound:  number;
}

/** The facts with the lookups a pass reads for every ticket and job, built once per `nextStepsOf`. */
interface IndexedPlaybookFacts extends PlaybookFacts {
  readonly launchesByJobId: JobLaunchesByJobId;
  readonly statusById:      ReadonlyMap<string, TicketStatus>;
  readonly ticketById:      ReadonlyMap<string, PlaybookTicket>;
}

function isCrash(cause: InterruptionCause | undefined): boolean {
  return cause !== undefined && (CRASH_INTERRUPTION_CAUSES as readonly InterruptionCause[]).includes(cause);
}

function jobLaunchesByJobIdOf(logRecords: readonly LogRecord[]): JobLaunchesByJobId {
  const launches = new Map<string, JobLaunch>();
  for (const record of logRecords) {
    if (record.kind !== 'job-launched') continue;
    const {
      kind, role, ticketIds, attempt, entity, stage
    } = record.fields;
    launches.set(record.jobId, {
      kind, role, ticketIds, attempt, ...(entity === undefined ? {} : { entity }), ...(stage === undefined ? {} : { stage })
    });
  }
  return launches;
}

function indexedFactsOf(facts: PlaybookFacts): IndexedPlaybookFacts {
  return {
    ...facts,
    launchesByJobId: jobLaunchesByJobIdOf(facts.logRecords),
    statusById:      new Map(facts.tickets.map((ticket) => [ticket.id, ticket.status])),
    ticketById:      new Map(facts.tickets.map((ticket) => [ticket.id, ticket])),
  };
}

/** A clock exception: the vendor names the reset as a time, and only `now` can honour it. */
function usageLimitHolds(limits: LifecycleLimits): boolean {
  return limits.usageResetsAt !== null && Date.parse(limits.now) < Date.parse(limits.usageResetsAt);
}

/**
 * Counted crashes since the user last set the board running or the outage last opened, on jobs of different tickets back to back: a crash on
 * the ticket of the one before it starts the run again, and a verified job ending breaks it. A reboot is no counted crash.
 */
function outageIsDue(facts: PlaybookFacts, limits: LifecycleLimits): boolean {
  return outageIsDueWith(facts.logRecords, jobLaunchesByJobIdOf(facts.logRecords), limits);
}

function outageIsDueWith(logRecords: readonly LogRecord[], launches: JobLaunchesByJobId, limits: LifecycleLimits): boolean {
  let crashedTicketKeys: string[] = [];
  for (const record of logRecords) {
    if (record.kind === 'hephaestus-set' && record.fields.state === 'running') crashedTicketKeys = [];
    if (record.kind === 'decision-opened' && record.fields.kind === 'outage') crashedTicketKeys = [];
    if (record.kind === 'job-ended' && VERIFIED_OUTCOMES.includes(record.fields.outcome)) crashedTicketKeys = [];
    if (record.kind !== 'job-interrupted' || !isCrash(record.fields.cause)) continue;
    const ticketKey = [...launches.get(record.jobId)?.ticketIds ?? []].sort().join(',');
    if (ticketKey === '') continue;
    crashedTicketKeys = crashedTicketKeys.at(-1) === ticketKey ? [ticketKey] : [...crashedTicketKeys, ticketKey];
  }
  return crashedTicketKeys.length >= limits.CONSECUTIVE_DEAD_AGENTS_BEFORE_STOPPING;
}

/** Back-to-back `replaced` endings of the ticket's jobs since its last `job-lost` incident opened. */
function replacedInARowOf(ticketId: string, facts: IndexedPlaybookFacts): number {
  const launches = facts.launchesByJobId;
  let replacedInARow = 0;
  for (const record of facts.logRecords) {
    if (record.kind === 'incident-opened' && record.fields.kind === 'job-lost' && record.fields.ticketIds.includes(ticketId)) replacedInARow = 0;
    if (record.kind !== 'job-ended' || !(launches.get(record.jobId)?.ticketIds.includes(ticketId) ?? false)) continue;
    replacedInARow = record.fields.outcome === 'replaced' ? replacedInARow + 1 : 0;
  }
  return replacedInARow;
}

/** Back-to-back failed Assistant jobs since Hephaestus last started. */
function failedAssistantBootsOf(facts: IndexedPlaybookFacts): number {
  const launches = facts.launchesByJobId;
  let failedBoots = 0;
  for (const record of facts.logRecords) {
    if (record.kind === 'hephaestus-started') failedBoots = 0;
    if (record.kind !== 'job-ended' || launches.get(record.jobId)?.kind !== 'assistant') continue;
    failedBoots = record.fields.outcome === 'failed' ? failedBoots + 1 : 0;
  }
  return failedBoots;
}

/** Review rounds granted since the ticket last went into review: the next review is one past them. */
function nextReviewRoundOf(ticketId: string, facts: IndexedLog): number {
  const launches = facts.launchesByJobId;
  let grantedRounds = 0;
  for (const record of facts.logRecords) {
    if (record.kind === 'ticket-finished' && record.ticketId === ticketId) grantedRounds = 0;
    if (record.kind === 'job-ended' && record.fields.outcome === 'round-granted' && (launches.get(record.jobId)?.ticketIds.includes(ticketId) ?? false)) grantedRounds += 1;
  }
  return grantedRounds + 1;
}

/**
 * The round of a review stage's next pass: one past the rounds that the ticket's reviews of the same entity and stage were granted. Rounds
 * are numbered per stage, so another stage's review never counts, and kept when the ticket returns to the stage.
 */
function nextStageReviewRoundOf(ticketId: string, launchStage: LaunchStage, facts: IndexedLog): number {
  const launches = facts.launchesByJobId;
  const stageKey = FailedPassUtil.stageKeyOf(launchStage);
  let stageRoundsGranted = 0;
  for (const record of facts.logRecords) {
    if (record.kind === 'tracker-cleared') stageRoundsGranted = 0;
    if (record.kind !== 'job-ended' || record.fields.outcome !== 'round-granted') continue;
    const launch = launches.get(record.jobId);
    if (launch?.kind === 'review' && launch.ticketIds.includes(ticketId) && FailedPassUtil.stageKeyOf(launch) === stageKey) stageRoundsGranted += 1;
  }
  return stageRoundsGranted + 1;
}

/** The ticket's newest build launch, whose entity and stage a returning builder's cycle runs in. */
function newestBuildLaunchOf(ticketId: string, facts: IndexedLog): JobLaunch | undefined {
  return [...facts.launchesByJobId.values()].findLast((launch) => launch.kind === 'build' && launch.ticketIds.includes(ticketId));
}

/** Zero for a ticket no build job was launched for. */
function lastBuildAttemptOf(ticketId: string, facts: IndexedLog): number {
  const buildAttempts = [...facts.launchesByJobId.values()]
    .filter((launch) => launch.kind === 'build' && launch.ticketIds.includes(ticketId))
    .map((launch) => launch.attempt);
  return Math.max(0, ...buildAttempts);
}

interface HandoffCycle {
  kind:      JobKind;
  ticketIds: readonly string[];
  attempt:   number;
  entity?:   string;
  stage?:    number;
}

/**
 * The resumes of a handoff cycle, every job of its kind, tickets, attempt, entity and stage, so a fresh session that took over a session the vendor
 * could not resume carries on the same count: its red-handoff resumes, and for a build cycle each review of its tickets that did not
 * hold after the cycle began, since the builder is resumed with that review's findings. A cycle of an entity never counts a review of
 * another entity: a package review sends back the package's builder, never the home builder.
 */
function handoffCycleResumesOf(cycle: HandoffCycle, logRecords: readonly LogRecord[]): number {
  return handoffCycleResumesWith(cycle, logRecords, jobLaunchesByJobIdOf(logRecords));
}

function handoffCycleResumesWith(cycle: HandoffCycle, logRecords: readonly LogRecord[], launches: JobLaunchesByJobId): number {
  const ticketKey = [...cycle.ticketIds].sort().join(',');
  const inTheCycle = (jobId: string): boolean => {
    const launch = launches.get(jobId);
    return launch !== undefined && launch.kind === cycle.kind && launch.attempt === cycle.attempt && [...launch.ticketIds].sort().join(',') === ticketKey
      && FailedPassUtil.stageKeyOf(launch) === FailedPassUtil.stageKeyOf(cycle);
  };
  let cycleBegan = false;
  let resumes = 0;
  for (const record of logRecords) {
    if (record.kind === 'job-launched' && inTheCycle(record.jobId)) cycleBegan = true;
    if (record.kind === 'job-resumed' && record.fields.cause === HANDOFF_RED_INTERRUPTION && inTheCycle(record.jobId)) resumes += 1;
    const endedReview = record.kind === 'job-ended' && record.fields.outcome === 'does-not-hold' ? launches.get(record.jobId) : undefined;
    const reviewOfTheCycle = endedReview?.kind === 'review' && endedReview.ticketIds.some((ticketId) => cycle.ticketIds.includes(ticketId))
      && (cycle.entity === undefined || endedReview.entity === undefined || endedReview.entity === cycle.entity);
    if (cycleBegan && cycle.kind === 'build' && reviewOfTheCycle) resumes += 1;
  }
  return resumes;
}

function redHandoffResumesOf(job: Readonly<Job>, facts: IndexedPlaybookFacts): number {
  return handoffCycleResumesWith(job, facts.logRecords, facts.launchesByJobId);
}

/**
 * The ticket's newest ended build job was `built`: its review sent it back, and that builder's session is resumed with the findings.
 * An unhold since then starts a fresh attempt instead, so a ticket parked past its resumes does not park again.
 */
function builderReturnsFromReview(ticketId: string, facts: IndexedLog): boolean {
  const launches = facts.launchesByJobId;
  let returns = false;
  for (const record of facts.logRecords) {
    if (record.kind === 'ticket-unheld' && record.ticketId === ticketId) returns = false;
    if (record.kind !== 'job-ended') continue;
    const launch = launches.get(record.jobId);
    if (launch?.kind === 'build' && launch.ticketIds.includes(ticketId)) returns = record.fields.outcome === 'built';
  }
  return returns;
}

/**
 * The ticket's newest ended build job declared needs: once they are settled, the stage that declared them runs again in the same attempt.
 * An unhold since then starts a fresh attempt instead.
 */
function builderReturnsFromItsNeeds(ticketId: string, facts: IndexedLog): boolean {
  const launches = facts.launchesByJobId;
  let returns = false;
  for (const record of facts.logRecords) {
    if (record.kind === 'ticket-unheld' && record.ticketId === ticketId) returns = false;
    if (record.kind !== 'job-ended') continue;
    const launch = launches.get(record.jobId);
    if (launch?.kind === 'build' && launch.ticketIds.includes(ticketId)) returns = record.fields.outcome === 'needs-declared';
  }
  return returns;
}

/** The ticket's newest ended build job was replaced while interrupted on a red handoff: its fresh successor keeps the attempt. */
function redHandoffCarriesOver(ticketId: string, facts: IndexedLog): boolean {
  const launches = facts.launchesByJobId;
  const lastInterruptionByJobId = new Map<string, InterruptionCause>();
  let carriesOver = false;
  for (const record of facts.logRecords) {
    if (record.kind === 'job-interrupted') lastInterruptionByJobId.set(record.jobId, record.fields.cause);
    if (record.kind !== 'job-ended') continue;
    const launch = launches.get(record.jobId);
    if (launch?.kind !== 'build' || !launch.ticketIds.includes(ticketId)) continue;
    carriesOver = record.fields.outcome === 'replaced' && lastInterruptionByJobId.get(record.jobId) === HANDOFF_RED_INTERRUPTION;
  }
  return carriesOver;
}

/**
 * A fresh build is one attempt past the last; a red handoff's successor, a builder a review sent back, or a builder whose needs are settled
 * keeps the last attempt.
 */
function nextBuildOf(ticket: Pick<PlaybookTicket, 'id' | 'status'>, facts: IndexedLog): { attempt: number; carriesOver: boolean } {
  const returnsToTheBuilder = builderReturnsFromReview(ticket.id, facts) || builderReturnsFromItsNeeds(ticket.id, facts);
  const carriesOver = redHandoffCarriesOver(ticket.id, facts) || (ticket.status === 'in-progress' && returnsToTheBuilder);
  return { attempt: lastBuildAttemptOf(ticket.id, facts) + (carriesOver ? 0 : 1), carriesOver };
}

function targetOf(ticket: PlaybookTicket, observations: PlaybookObservations): string {
  return ticket.group === undefined ? observations.mainLine : `${observations.groupTargetPrefix}${ticket.group}`;
}

function openDecisionOfKind(facts: PlaybookFacts, kind: Decision['kind']): boolean {
  return facts.decisions.some((decision) => decision.kind === kind);
}

function ticketHasAJob(ticketId: string, facts: PlaybookFacts): boolean {
  return facts.jobs.some((job) => job.ticketIds.includes(ticketId));
}

function ticketHasAnOpenJobLostIncident(ticketId: string, facts: PlaybookFacts): boolean {
  return facts.incidents.some((incident) => incident.kind === 'job-lost' && incident.ticketIds.includes(ticketId));
}

/**
 * A held ticket never launches: a hold of any reason, or an incident naming it that the Assistant has not settled (a `job-lost`, or a
 * build that ended on `setup-failed`, `blocked`, `out-of-calls`, `gate-cannot-run` or `sandbox-unavailable`), so no fresh job races the incident's
 * move.
 */
function ticketIsHeld(ticket: PlaybookTicket, facts: PlaybookFacts): boolean {
  if (ticket.hold !== undefined || ticket.mergeQueued === true) return true;
  if (facts.observations.ticketIdsTouchingAgentConfig.includes(ticket.id)) return true;
  if (facts.decisions.some((decision) => TICKET_HOLDING_DECISION_KINDS.includes(decision.kind) && decision.ticketIds.includes(ticket.id))) return true;
  if (facts.decisions.some((decision) => CROSSING_HOLDING_DECISION_KINDS.includes(decision.kind) && decision.ticketIds.includes(ticket.id))) return true;
  // A question whose job ended holds its ticket until answered, whatever else holds it, so no fresh agent races the answer.
  if (facts.decisions.some((decision) => decision.kind === 'agent-question' && decision.jobId === null && decision.ticketIds.includes(ticket.id))) return true;
  return facts.incidents.some((incident) => incident.ticketIds.includes(ticket.id));
}

function jobResumeIsHeld(job: Readonly<Job>, facts: PlaybookFacts): boolean {
  return job.ticketIds.some((ticketId) => facts.observations.ticketIdsTouchingAgentConfig.includes(ticketId));
}

/** A session stopped at its question resumes only once the question is answered, so the resume can carry the answer. */
function jobAwaitsAnAnswer(job: Readonly<Job>, facts: Pick<PlaybookFacts, 'decisions' | 'incidents'>): boolean {
  return facts.decisions.some((decision) => decision.jobId === job.id)
    || facts.incidents.some((incident) => incident.jobId === job.id && (incident.kind === 'system-question' || incident.kind === 'malformed-ticket'));
}

/** Only a crash counts toward the bound: every other cause resumes, or waits, whatever the count. */
function crashResumesAreSpent(job: Readonly<Job>, limits: LifecycleThresholds): boolean {
  return isCrash(job.interruption ?? UNRECORDED_INTERRUPTION_CAUSE) && job.crashResumes >= limits.CRASH_RESUMES_BEFORE_WAITING;
}

/** The job's interruption cause as a resume reads it: one that recorded none reads as a lost child. */
function interruptionCauseOf(job: Readonly<Job>): InterruptionCause {
  return job.interruption ?? UNRECORDED_INTERRUPTION_CAUSE;
}

/** The resume policy of the job's interruption; a crash whose resumes reached the bound waits for User's resume. */
function resumePolicyOf(job: Readonly<Job>, limits: LifecycleThresholds): ResumePolicy {
  if (crashResumesAreSpent(job, limits)) return 'waits-for-instruction';
  return RESUME_POLICY_OF_CAUSE[job.interruption ?? UNRECORDED_INTERRUPTION_CAUSE];
}

/**
 * User's resume of the job, or an answer to a question it asked, logged after its newest interruption or lost line: an instruction never
 * outlives what it answered, so a later interruption or lost line waits again. Read from the log alone, in log order.
 */
function resumeIsInstructed(job: Readonly<Job>, logRecords: readonly LogRecord[]): boolean {
  const answeredRequestIds = new Set(job.answeredRequestIds);
  let instructed = false;
  for (const record of logRecords) {
    if ((record.kind === 'job-interrupted' || record.kind === 'job-line-lost') && record.jobId === job.id) instructed = false;
    if (record.kind === 'job-resume-instructed' && record.jobId === job.id) instructed = true;
    if (record.kind === 'decision-answered' && record.fields.requestId !== undefined && answeredRequestIds.has(record.fields.requestId)) instructed = true;
  }
  return instructed;
}

/**
 * The job's install or gate line a start found lost waits for User's resume, which runs the line again: only while the lost line is the
 * job's newest interruption or lost line, so a lost line already resumed never comes back with a later interruption.
 */
function lostLineAwaitsResume(job: Readonly<Job>, logRecords: readonly LogRecord[]): boolean {
  let lostLineIsNewest = false;
  for (const record of logRecords) {
    if (record.kind === 'job-interrupted' && record.jobId === job.id) lostLineIsNewest = false;
    if (record.kind === 'job-line-lost' && record.jobId === job.id) lostLineIsNewest = true;
  }
  return lostLineIsNewest && !resumeIsInstructed(job, logRecords);
}

/** A resume under the job's policy: one that waits needs an instruction first, and every resume obeys its holds, an instructed one too. */
function resumeStepsOf(job: Readonly<Job>, facts: PlaybookFacts, limits: LifecycleThresholds, resumeIsHeld: boolean): PlaybookStep[] {
  const policy = resumePolicyOf(job, limits);
  if (policy === 'never-resumes') return [];
  const instructed = resumeIsInstructed(job, facts.logRecords);
  if (policy === 'waits-for-instruction' && !instructed) return [];
  return resumeIsHeld ? [] : [{ kind: 'resume-job', jobId: job.id, instructed }];
}

/** An Assistant interrupted by its own outage or lease end waits for User's resume, and is replaced once it came; any other is replaced at once. */
function assistantWaitsForInstruction(job: Readonly<Job>, logRecords: readonly LogRecord[]): boolean {
  const cause = job.interruption ?? UNRECORDED_INTERRUPTION_CAUSE;
  if (FORGE_ENDING_INTERRUPTION_CAUSES.includes(cause)) return false;
  return RESUME_POLICY_OF_CAUSE[cause] === 'waits-for-instruction' && !resumeIsInstructed(job, logRecords);
}

/**
 * What an interrupted job, or one whose lost line waits, waits for before it runs again, as the passes read it: User's resume, the answer
 * to its question, the decision that names its failure, nothing, or never. A hold that clears by itself, such as a usage limit, is no wait.
 */
function resumeWaitOf(job: Readonly<Job>, facts: Pick<PlaybookFacts, 'decisions' | 'incidents' | 'logRecords'>, limits: LifecycleThresholds): ResumeWait {
  if (job.state !== 'interrupted') return lostLineAwaitsResume(job, facts.logRecords) ? 'instruction' : 'nothing';
  const policy = resumePolicyOf(job, limits);
  if (policy === 'never-resumes') return 'never';
  if (policy === 'resumes-once-decision-answered') return 'decision';
  if (REPLACED_SESSION_JOB_KINDS.includes(job.kind)) return assistantWaitsForInstruction(job, facts.logRecords) ? 'instruction' : 'nothing';
  if (jobAwaitsAnAnswer(job, facts)) return 'answer';
  return policy === 'waits-for-instruction' && !resumeIsInstructed(job, facts.logRecords) ? 'instruction' : 'nothing';
}

/**
 * An intake conversation survives a reboot: an interrupted product owner follows its cause's policy and resumes by id once any question it
 * asked is answered. Past the crash bound it is never resumed by itself: with a question open it waits `awaiting-answer` with no process,
 * otherwise it waits for User's resume.
 */
function productOwnerStepsOf(job: Readonly<Job>, facts: PlaybookFacts, limits: LifecycleLimits, resumesAreHeld: boolean): PlaybookStep[] {
  const awaitsAnAnswer = jobAwaitsAnAnswer(job, facts);
  if (job.state === 'awaiting-answer') return awaitsAnAnswer ? [] : [{ kind: 'refresh-intake', jobId: job.id }];
  if (crashResumesAreSpent(job, limits) && awaitsAnAnswer) return [{ kind: 'await-answer', jobId: job.id }];
  return resumeStepsOf(job, facts, limits, resumesAreHeld || awaitsAnAnswer);
}

/** User's answers, in question order, to the newest `waiver` decision opened on the job's ticket since it launched; `null` while unanswered. */
function waiverAnswersOf(job: Readonly<Job>, logRecords: readonly LogRecord[]): string[] | null {
  const ticketId = job.ticketIds[0] ?? '';
  let launched = false;
  let waiverDecisionId: string | null = null;
  let answers: string[] | null = null;
  for (const record of logRecords) {
    if (record.kind === 'job-launched' && record.jobId === job.id) launched = true;
    if (!launched) continue;
    if (record.kind === 'decision-opened' && record.fields.kind === 'waiver' && record.fields.ticketIds.includes(ticketId)) {
      waiverDecisionId = record.decisionId;
      answers = null;
    }
    if (record.kind === 'decision-answered' && record.decisionId === waiverDecisionId) answers = Object.values(record.fields.answer);
  }
  return answers;
}

/** A review waits `awaiting-answer` only on its waiver: once User answered it, from any surface, the next pass acts on the answer. */
function waiverAnswerStepsOf(facts: PlaybookFacts): PlaybookStep[] {
  return facts.jobs
    .filter((job) => job.kind === 'review' && job.state === 'awaiting-answer')
    .flatMap((job): PlaybookStep[] => {
      const answers = waiverAnswersOf(job, facts.logRecords);
      return answers === null ? [] : [{ kind: 'act-on-waiver-answer', jobId: job.id, answers }];
    });
}

/** A red handoff resumes the same session while its cycle has resumes left; the next red ends it and parks its ticket for User. */
function redHandoffStepsOf(job: Readonly<Job>, facts: IndexedPlaybookFacts, limits: LifecycleLimits, resumesAreHeld: boolean): PlaybookStep[] {
  const ticketId = job.ticketIds[0];
  if (redHandoffResumesOf(job, facts) >= limits.RED_HANDOFF_RESUMES_BEFORE_PARKING && ticketId !== undefined && TICKET_WORK_JOB_KINDS.includes(job.kind)) {
    return [{
      kind: 'park', ticketId, cause: 'red-resumes-spent', jobId: job.id
    }];
  }
  return resumeStepsOf(job, facts, limits, resumesAreHeld || jobResumeIsHeld(job, facts) || jobAwaitsAnAnswer(job, facts));
}

interface ResumeHolds {
  resumesAreHeld:              boolean;
  pipelineAgentResumesAreHeld: boolean;
}

/** A child tree that refused the forced stop may still run: nothing resumes or replaces its job beside it. */
function crashBoundStepsOf(facts: IndexedPlaybookFacts, limits: LifecycleLimits, holds: ResumeHolds): PlaybookStep[] {
  const { resumesAreHeld } = holds;
  const settledJobs = facts.jobs.filter((job) => job.state !== 'interrupted' || job.interruption !== FORCED_STOP_REFUSED_INTERRUPTION);
  const productOwnerSteps = settledJobs
    .filter((job) => job.kind === 'product-owner' && (job.state === 'interrupted' || job.state === 'awaiting-answer'))
    .flatMap((job) => productOwnerStepsOf(job, facts, limits, resumesAreHeld));
  return [...productOwnerSteps, ...settledJobs.filter((job) => job.state === 'interrupted' && job.kind !== 'product-owner').flatMap((job): PlaybookStep[] => {
    if (job.interruption === HANDOFF_RED_INTERRUPTION) return redHandoffStepsOf(job, facts, limits, resumesAreHeld);
    if (REPLACED_SESSION_JOB_KINDS.includes(job.kind)) {
      return assistantWaitsForInstruction(job, facts.logRecords) ? [] : [{ kind: 'replace-job', jobId: job.id }];
    }
    if (job.kind === 'pipeline-agent') return resumeStepsOf(job, facts, limits, holds.pipelineAgentResumesAreHeld);
    return resumeStepsOf(job, facts, limits, resumesAreHeld || jobResumeIsHeld(job, facts) || jobAwaitsAnAnswer(job, facts));
  })];
}

/** A builder a review sent back past its cycle's resumes is never resumed again: the review that did not hold is one past the last. */
function reviewResumesAreSpent(ticket: PlaybookTicket, facts: IndexedPlaybookFacts, limits: LifecycleLimits): boolean {
  if (ticket.status !== 'in-progress' || !builderReturnsFromReview(ticket.id, facts)) return false;
  const newestBuild = newestBuildLaunchOf(ticket.id, facts);
  const cycle: HandoffCycle = {
    kind:      'build',
    ticketIds: [ticket.id],
    attempt:   lastBuildAttemptOf(ticket.id, facts),
    ...(newestBuild?.entity === undefined ? {} : { entity: newestBuild.entity }),
    ...(newestBuild?.stage === undefined ? {} : { stage: newestBuild.stage }),
  };
  return handoffCycleResumesWith(cycle, facts.logRecords, facts.launchesByJobId) > limits.RED_HANDOFF_RESUMES_BEFORE_PARKING;
}

function parkStepsOf(facts: IndexedPlaybookFacts, limits: LifecycleLimits): PlaybookStep[] {
  return facts.tickets
    .filter((ticket) => ticket.hold === undefined && (ticket.status === 'in-progress' || ticket.status === 'in-review') && !ticketHasAJob(ticket.id, facts))
    .flatMap((ticket): PlaybookStep[] => {
      if (FailedPassUtil.failedPassesOf(ticket.id, facts.logRecords) >= limits.FAILED_PASSES_BEFORE_PARKING) return [{ kind: 'park', ticketId: ticket.id, cause: 'failed-passes' }];
      return reviewResumesAreSpent(ticket, facts, limits) ? [{ kind: 'park', ticketId: ticket.id, cause: 'red-resumes-spent' }] : [];
    });
}

function jobLostStepsOf(facts: IndexedPlaybookFacts, limits: LifecycleLimits): PlaybookStep[] {
  return facts.tickets
    .filter((ticket) => !ticketHasAnOpenJobLostIncident(ticket.id, facts) && !ticketHasAJob(ticket.id, facts))
    .filter((ticket) => replacedInARowOf(ticket.id, facts) >= limits.REPLACED_JOBS_BEFORE_JOB_LOST)
    .map((ticket) => ({
      kind:     'open-incident',
      incident: {
        kind: 'job-lost', ticketIds: [ticket.id], jobId: null, facts: {}, defaultMove: 'ticket-park'
      },
    }));
}

/**
 * The tickets filed for the needs that `ticket` declared: each one it waits on that a job of its own filed. A worker's finding waits on its
 * finder instead, so it is never one.
 */
function needTicketIdsOf(ticket: PlaybookTicket, facts: IndexedPlaybookFacts): string[] {
  return (ticket.dependsOn ?? []).filter((dependencyId) => {
    const filedByJob = facts.ticketById.get(dependencyId)?.filedByJob;
    return filedByJob !== undefined && (facts.launchesByJobId.get(filedByJob)?.ticketIds.includes(ticket.id) ?? false);
  });
}

function ticketIsClosed(ticket: PlaybookTicket): boolean {
  return TICKET_STATUSES_THAT_CLOSE_A_TICKET.includes(ticket.status);
}

/**
 * The rank a ticket launches at. On a pipeline with entities a need's ticket takes the highest priority of itself and every open ticket
 * that waits on it, also through a need of a need, so raising a waiting ticket raises its needs at the next pass.
 */
function launchRankOf(ticket: PlaybookTicket, facts: IndexedPlaybookFacts): number {
  const ownRank = PRIORITY_RANK[TicketDefaultsUtil.ticketPriorityOf(ticket)];
  if (!facts.pipelineHasEntities) return ownRank;
  const rankedTicketIds = new Set([ticket.id]);
  const waitersOf = (needTicketId: string): PlaybookTicket[] => facts.tickets.filter((waiter) => !ticketIsClosed(waiter) && !rankedTicketIds.has(waiter.id)
    && needTicketIdsOf(waiter, facts).includes(needTicketId));
  let rank = ownRank;
  let needTicketIds = [ticket.id];
  while (needTicketIds.length > 0) {
    const waiters = needTicketIds.flatMap(waitersOf);
    for (const waiter of waiters) {
      rankedTicketIds.add(waiter.id);
      rank = Math.min(rank, PRIORITY_RANK[TicketDefaultsUtil.ticketPriorityOf(waiter)]);
    }
    needTicketIds = waiters.map((waiter) => waiter.id);
  }
  return rank;
}

/** On a pipeline with entities a need's ticket abandoned no longer holds the ticket that waits on it: the dependency drops and User decides. */
function abandonedNeedStepsOf(facts: IndexedPlaybookFacts): PlaybookStep[] {
  if (!facts.pipelineHasEntities) return [];
  return facts.tickets.filter((ticket) => !ticketIsClosed(ticket)).flatMap((ticket) => needTicketIdsOf(ticket, facts)
    .filter((needTicketId) => facts.statusById.get(needTicketId) === 'abandoned')
    .map((needTicketId): PlaybookStep => ({ kind: 'release-abandoned-need', ticketId: ticket.id, needTicketId })));
}

/** A need's ticket settles only on the main line: a `reviewed` one is on a group branch at most, so the stage it reruns could not use it. */
const NEED_SETTLING_STATUS: TicketStatus = 'delivered';

/** On a pipeline with entities: a dependency is unsettled, or a need's ticket is not yet delivered. */
function waitsOnADependency(ticket: PlaybookTicket, facts: IndexedPlaybookFacts): boolean {
  if (TicketDependencyUtil.unsettledDependenciesOf(ticket.dependsOn ?? [], facts.statusById).length > 0) return true;
  return needTicketIdsOf(ticket, facts).some((needTicketId) => facts.statusById.get(needTicketId) !== NEED_SETTLING_STATUS);
}

/**
 * The stage a launch of a ticket that crosses into no package runs: its own entity's build (stage 1) or review (stage 5). Nothing on a forge
 * without entities, whose launch names no stage.
 */
function ownEntityLaunchStageOf(ticket: PlaybookTicket, facts: IndexedPlaybookFacts, stageName: 'build' | 'review'): Partial<LaunchStage> {
  if (!facts.pipelineHasEntities || ticket.entity === undefined) return {};
  return { entity: ticket.entity, stage: TicketStageUtil.stageNumberOf(stageName) };
}

/**
 * A ticket whose row stores a stage launches that stage's job whatever its status, a review stage only for an entity with a review phase.
 * Its attempt is read as any build's, its round within its stage.
 */
function stageCandidateOf(ticket: PlaybookTicket, stage: TicketStage, facts: IndexedPlaybookFacts): Candidate | null {
  const launchStage: LaunchStage = { entity: stage.entity, stage: TicketStageUtil.stageNumberOf(stage.name) };
  const base = targetOf(ticket, facts.observations);
  if (REVIEW_STAGE_NAMES.includes(stage.name)) {
    if (!facts.entitiesWithReview.includes(stage.entity)) return null;
    return {
      ticket,
      phase: 'review',
      step:  {
        kind: 'launch-review', ticketId: ticket.id, round: nextStageReviewRoundOf(ticket.id, launchStage, facts), target: base, ...launchStage
      }
    };
  }
  return {
    ticket,
    phase: 'stage',
    step:  {
      kind: 'launch-build', ticketId: ticket.id, attempt: nextBuildOf(ticket, facts).attempt, base, ...launchStage
    }
  };
}

/** On a pipeline with entities a ticket is reviewed when its entity has a review phase; on any other, when the pipeline has one. */
function reviewIsSetFor(ticket: PlaybookTicket, facts: IndexedPlaybookFacts): boolean {
  if (!facts.pipelineHasEntities || ticket.entity === undefined) return facts.reviewIsSet;
  return facts.entitiesWithReview.includes(ticket.entity);
}

function candidateOf(ticket: PlaybookTicket, facts: IndexedPlaybookFacts): Candidate | null {
  if (ticket.status !== 'in-review' && ticket.status !== 'in-progress' && ticket.status !== 'committed') return null;
  // On a pipeline with entities a ticket builds only in its entity's pipeline (E94), and a started one also waits for its dependencies and needs.
  if (facts.pipelineHasEntities && ticket.entity === undefined) return null;
  if (facts.pipelineHasEntities && waitsOnADependency(ticket, facts)) return null;
  if (facts.pipelineHasEntities && ticket.stage !== undefined && ticket.status !== 'committed') return stageCandidateOf(ticket, ticket.stage, facts);
  const base = targetOf(ticket, facts.observations);
  if (ticket.status === 'in-review') {
    if (!reviewIsSetFor(ticket, facts)) return null;
    return {
      ticket,
      phase: 'review',
      step:  {
        kind: 'launch-review', ticketId: ticket.id, round: nextReviewRoundOf(ticket.id, facts), target: base, ...ownEntityLaunchStageOf(ticket, facts, 'review')
      }
    };
  }
  const { attempt, carriesOver } = nextBuildOf(ticket, facts);
  if (ticket.status === 'in-progress' && (attempt > 1 || carriesOver)) return {
    ticket,
    phase: 'rebuild',
    step:  {
      kind: 'launch-build', ticketId: ticket.id, attempt, base, ...ownEntityLaunchStageOf(ticket, facts, 'build')
    }
  };
  if (ticket.status !== 'committed') return null;
  const { statusById } = facts;
  if (TicketDependencyUtil.unsettledDependenciesOf(ticket.dependsOn ?? [], statusById).length > 0) return null;
  return {
    ticket,
    phase: 'build',
    step:  {
      kind: 'launch-build', ticketId: ticket.id, attempt, base, ...ownEntityLaunchStageOf(ticket, facts, 'build')
    }
  };
}

function candidateOrder(facts: IndexedPlaybookFacts): (a: Candidate, b: Candidate) => number {
  const readinessOf = (candidate: Candidate): number => facts.readinessPositionByTicketId.get(candidate.ticket.id) ?? UNRECORDED_READINESS_POSITION;
  const launchRankByTicketId = new Map<string, number>();
  const rankOf      = (candidate: Candidate): number => {
    const rank = launchRankByTicketId.get(candidate.ticket.id) ?? launchRankOf(candidate.ticket, facts);
    launchRankByTicketId.set(candidate.ticket.id, rank);
    return rank;
  };
  return (a, b) => (
    rankOf(a) - rankOf(b)
    || WORK_PHASE_RANK[a.phase] - WORK_PHASE_RANK[b.phase]
    || readinessOf(a) - readinessOf(b)
    || Number(a.ticket.id) - Number(b.ticket.id)
  );
}

function freeSlotsOf(facts: PlaybookFacts): number {
  return ConcurrencyUtil.concurrencyOf(facts.jobs, facts.concurrencyLimit).freeSlots;
}

function launchEntityOf(step: PlaybookStep): EntityKey | undefined {
  return step.kind === 'launch-build' || step.kind === 'launch-review' ? step.entity : undefined;
}

/**
 * The candidates, in order, that their entity's cap leaves room for (E72): an entity's running jobs that hold a slot, whatever ticket they
 * serve, and the candidates of it kept before, count against its cap. A candidate past its cap gives its place to the next one.
 */
function candidatesWithinEntityCapsOf(candidates: readonly Candidate[], facts: PlaybookFacts): Candidate[] {
  if (!facts.pipelineHasEntities) return [...candidates];
  const jobsByEntity = new Map<EntityKey, number>();
  for (const job of facts.jobs) {
    if (job.entity !== undefined && LaunchSlotUtil.jobHoldsLaunchSlot(job)) jobsByEntity.set(job.entity, (jobsByEntity.get(job.entity) ?? 0) + 1);
  }
  return candidates.filter((candidate) => {
    const entity = launchEntityOf(candidate.step);
    if (entity === undefined || !Object.hasOwn(facts.concurrencyByEntity, entity)) return true;
    const entityJobs = jobsByEntity.get(entity) ?? 0;
    if (entityJobs >= (facts.concurrencyByEntity[entity] ?? 0)) return false;
    jobsByEntity.set(entity, entityJobs + 1);
    return true;
  });
}

const DOCUMENT_AGENT_KIND: JobKind = 'document-agent';

function documentFactsOf(document: Readonly<TicketDocument> | undefined, standing: DocumentStanding, approvedSpecNumber: number | null): PlaybookDocumentFacts {
  return {
    hasVersion:                  document !== undefined && document.versions.length > 0,
    standing,
    messageWaits:                document?.messages.some((message) => message.state === 'queued') ?? false,
    openProposalForApprovedSpec: approvedSpecNumber !== null
      && (document?.proposals.some((proposal) => proposal.state === 'proposed' && proposal.forSpecNumber === approvedSpecNumber) ?? false),
  };
}

/** The documents of each record, as `PlaybookFacts.ticketDocuments` holds them. */
function ticketDocumentFactsOf(records: readonly LoadedTicketDocumentRecord[]): PlaybookTicketDocuments[] {
  return records.map(({ record }) => {
    const documentOfKind     = (kind: TicketDocumentKind): Readonly<TicketDocument> | undefined => record.documents.find((document) => document.kind === kind);
    const standings          = TicketDocumentStandingUtil.standingsOf(record);
    const spec               = documentOfKind('spec');
    const approvedSpecNumber = spec === undefined ? null : TicketDocumentVersionUtil.approvedHeadNumberOf(spec);
    return {
      ticketId: record.ticketId,
      spec:     documentFactsOf(spec, standings.spec, null),
      plan:     documentFactsOf(documentOfKind('plan'), standings.plan, approvedSpecNumber),
      approvedSpecNumber,
    };
  });
}

/** The agents of a ticket's document launched so far, in launch order, each with the attempt it carried and how it ended. */
function documentAgentLaunchesOf(ticketId: string, document: TicketDocumentKind, facts: IndexedPlaybookFacts): { jobId: string; attempt: number; outcome: JobOutcome | null }[] {
  const role = DocumentAgentJobUtil.roleOf(document);
  const launches = [...facts.launchesByJobId.entries()]
    .filter(([, launch]) => launch.kind === DOCUMENT_AGENT_KIND && launch.role === role && launch.ticketIds[0] === ticketId);
  return launches.map(([jobId, launch]) => {
    const ended = facts.logRecords.findLast((record) => record.kind === 'job-ended' && record.jobId === jobId);
    return { jobId, attempt: launch.attempt, outcome: ended?.kind === 'job-ended' ? ended.fields.outcome : null };
  });
}

/**
 * Whether a document's agent starts by itself: the spec's first write, the plan's first write once the spec is approved, or the plan again
 * once a newer spec version is approved and no edit for it is open. Each starts once per spec version a plan is written for, and never
 * after its agent failed: only a message User queues starts it then.
 */
function documentAgentIsDue(documents: PlaybookTicketDocuments, document: TicketDocumentKind, facts: IndexedPlaybookFacts): boolean {
  const launches = documentAgentLaunchesOf(documents.ticketId, document, facts);
  if (launches.at(-1)?.outcome === 'failed') return false;
  if (document === 'spec') return !documents.spec.hasVersion && launches.length === 0;
  const { approvedSpecNumber, plan } = documents;
  if (documents.spec.standing !== 'approved' || approvedSpecNumber === null) return false;
  if (launches.some((launch) => launch.attempt === approvedSpecNumber)) return false;
  return !plan.hasVersion || (plan.standing === 'out-of-date' && !plan.openProposalForApprovedSpec);
}

/**
 * A ticket no agent picked up whose document needs its agent: a queued message, or a first write or a newer spec, with no agent working it.
 * A waiting agent is started again only by a message, but for a waiting plan agent given an older spec than the approved one, which a fresh
 * agent replaces once the plan is due for the newer spec.
 */
function documentAgentCandidatesOf(facts: IndexedPlaybookFacts): PlaybookStep[] {
  return (facts.ticketDocuments ?? []).flatMap((documents) => {
    const status = facts.statusById.get(documents.ticketId);
    if (status === undefined || !TICKET_STATUSES_NO_AGENT_HAS_PICKED_UP.includes(status)) return [];
    return (['spec', 'plan'] as const).flatMap((document): PlaybookStep[] => {
      const agent = DocumentAgentJobUtil.liveAgentOf(facts.jobs, documents.ticketId, document);
      if (agent !== null && agent.state !== 'awaiting-answer') return [];
      const agentHoldsAnOlderSpec = agent !== null && document === 'plan' && documents.approvedSpecNumber !== null && agent.attempt !== documents.approvedSpecNumber;
      const due = documents[document].messageWaits || ((agent === null || agentHoldsAnOlderSpec) && documentAgentIsDue(documents, document, facts));
      return due ? [{ kind: 'launch-document-agent', ticketId: documents.ticketId, document }] : [];
    });
  });
}

/**
 * A document agent's turn is first in line, before any build: it takes the free slots first, and past them it waits. Then each entity's
 * cap passes the launches, then the board's free slots left bound them; of all of them, the ones past the machine's free slots wait as
 * `await-machine-slot`.
 */
function launchStepsOf(facts: IndexedPlaybookFacts, ticketIdsSettledThisPass: ReadonlySet<string>): PlaybookStep[] {
  const freeSlots     = freeSlotsOf(facts);
  const documentSteps = documentAgentCandidatesOf(facts).slice(0, freeSlots);
  const candidates = facts.tickets
    .filter((ticket) => !ticketIdsSettledThisPass.has(ticket.id) && !ticketHasAJob(ticket.id, facts) && !ticketIsHeld(ticket, facts))
    .flatMap((ticket) => candidateOf(ticket, facts) ?? [])
    .sort(candidateOrder(facts));
  const launchable = candidatesWithinEntityCapsOf(candidates, facts)
    .slice(0, freeSlots - documentSteps.length);
  const steps = [...documentSteps, ...launchable.map((candidate) => candidate.step)];
  const machineSlotsFree = facts.observations.machineAgentSlotsFree ?? steps.length;
  return steps.map((step, index): PlaybookStep => {
    if (index < machineSlotsFree) return step;
    return { kind: 'await-machine-slot', ticketId: step.kind === 'launch-document-agent' ? step.ticketId : ticketIdOfLaunch(step) };
  });
}

function ticketIdOfLaunch(step: PlaybookStep): string {
  return step.kind === 'launch-build' || step.kind === 'launch-review' ? step.ticketId : '';
}


function turnIsClosed(incident: Readonly<Incident>, facts: PlaybookFacts): boolean {
  const turn = incident.deliveredInTurn;
  if (turn === null) return false;
  if (!facts.jobs.some((job) => job.id === turn.jobId)) return true;
  return facts.observations.closedDeliveryTurns.some((closed) => closed.jobId === turn.jobId && closed.chatSequence === turn.chatSequence);
}

function turnSpentItsBudget(incident: Readonly<Incident>, facts: PlaybookFacts): boolean {
  const turn = incident.deliveredInTurn;
  return turn !== null && facts.observations.budgetSpentDeliveryTurns.some((spent) => spent.jobId === turn.jobId && spent.chatSequence === turn.chatSequence);
}

/** An incident a live Assistant was handed in a turn that has not closed: switching the Assistant off lets that turn finish. */
function incidentIsInAnOpenTurn(incident: Readonly<Incident>, facts: PlaybookFacts): boolean {
  return incident.deliveredInTurn !== null && !turnIsClosed(incident, facts);
}

/**
 * A delivered incident defaults when its turn closes. While no Assistant can come up, every one defaults. While the Assistant is off, every
 * one defaults but those of a turn still open, which wait for its end or its call budget.
 */
function incidentDefaultStepsOf(facts: PlaybookFacts, noAssistantCanComeUp: boolean): PlaybookStep[] {
  return facts.incidents.flatMap((incident): PlaybookStep[] => {
    if (!facts.assistantIsOn && !incidentIsInAnOpenTurn(incident, facts)) return [{ kind: 'default-incident', incidentId: incident.id, cause: 'assistant-off' }];
    if (!facts.assistantIsOn) return turnSpentItsBudget(incident, facts) ? [{ kind: 'default-incident', incidentId: incident.id, cause: 'turn-budget' }] : [];
    if (noAssistantCanComeUp) return [{ kind: 'default-incident', incidentId: incident.id, cause: 'no-assistant' }];
    if (turnIsClosed(incident, facts)) return [{ kind: 'default-incident', incidentId: incident.id, cause: 'turn-closed' }];
    if (turnSpentItsBudget(incident, facts)) return [{ kind: 'default-incident', incidentId: incident.id, cause: 'turn-budget' }];
    return [];
  });
}

/**
 * A `pipeline-proposal` decision an earlier release opened cannot be answered: the one-shot proposal it accepted retired. It is withdrawn at
 * the next pass, and the pipeline is set up through the setup record instead.
 */
function retiredDecisionStepsOf(facts: PlaybookFacts): PlaybookStep[] {
  return facts.decisions
    .filter((decision) => decision.kind === 'pipeline-proposal')
    .map((decision) => ({ kind: 'withdraw-retired-decision', decisionId: decision.id }));
}

/** A decision about the whole board, which names no ticket and no job. */
function boardDecisionStepOf(kind: Decision['kind']): PlaybookStep {
  return { kind: 'open-decision', decision: { kind, ticketIds: [], jobId: null } };
}

function ticketIdsOfStep(step: PlaybookStep): readonly string[] {
  if (step.kind === 'park' || step.kind === 'release-abandoned-need') return [step.ticketId];
  return step.kind === 'open-incident' ? step.incident.ticketIds : [];
}

function nextStepsOf(playbookFacts: PlaybookFacts, limits: LifecycleLimits): PlaybookStep[] {
  const facts                   = indexedFactsOf(playbookFacts);
  const outageNow               = facts.hephaestusState !== 'paused' && outageIsDueWith(facts.logRecords, facts.launchesByJobId, limits);
  const versionOrUsageHolds     = usageLimitHolds(limits) || facts.observations.installVersionChanged;
  // A refused API key refuses every session alike, so nothing starts until User answers the decision naming it.
  const authenticationHolds     = openDecisionOfKind(facts, 'api-authentication-failed');
  // An Assistant stopped at its budget would only spend the next one: no Assistant boots until User answers.
  const assistantBudgetHolds    = facts.decisions.some((decision) => decision.kind === 'budget-reached' && decision.ticketIds.length === 0);
  const outageHolds             = outageNow || openDecisionOfKind(facts, 'outage') || authenticationHolds;
  const resumesAreHeld          = versionOrUsageHolds || !facts.pipelineIsSet || outageHolds;
  const newWorkIsHeld           = resumesAreHeld || facts.hephaestusState === 'paused';
  const bootsKeepFailing        = failedAssistantBootsOf(facts) >= limits.FAILED_ASSISTANT_BOOTS_BEFORE_DEFAULTING;
  const noAssistantCanComeUp = usageLimitHolds(limits) || authenticationHolds || assistantBudgetHolds || (bootsKeepFailing && !facts.observations.assistantHasAnswered);
  const assistantMayBoot     = !usageLimitHolds(limits) && !authenticationHolds && !assistantBudgetHolds && (!bootsKeepFailing || facts.observations.assistantBootRetryDue);
  const assistantIsLive      = facts.jobs.some((job) => job.kind === 'assistant');

  const steps: PlaybookStep[] = [];
  if (outageNow) steps.push({ kind: 'pause-hephaestus', cause: 'outage' }, boardDecisionStepOf('outage'));
  if (!facts.pipelineIsSet && !openDecisionOfKind(facts, 'checks-not-set')) steps.push(boardDecisionStepOf('checks-not-set'));
  steps.push(...retiredDecisionStepsOf(facts));
  // The pipeline agent sets the pipeline up, so neither the missing pipeline nor the pause holds its resume.
  steps.push(...crashBoundStepsOf(facts, limits, { resumesAreHeld, pipelineAgentResumesAreHeld: versionOrUsageHolds || outageHolds }));
  steps.push(...waiverAnswerStepsOf(facts));
  if (!assistantIsLive && facts.assistantIsOn && assistantMayBoot && !facts.observations.installVersionChanged) steps.push({ kind: 'boot-assistant' });
  const parkSteps          = parkStepsOf(facts, limits);
  const jobLostSteps       = jobLostStepsOf(facts, limits);
  const abandonedNeedSteps = abandonedNeedStepsOf(facts);
  steps.push(...parkSteps, ...jobLostSteps, ...abandonedNeedSteps);
  const ticketIdsSettledThisPass = new Set([...parkSteps, ...jobLostSteps, ...abandonedNeedSteps].flatMap(ticketIdsOfStep));
  // Without a review phase the Airlocks queue a ticket in review once its branch HEAD's tree is gated green, so no step queues one.
  if (!newWorkIsHeld) steps.push(...launchStepsOf(facts, ticketIdsSettledThisPass));
  steps.push(...incidentDefaultStepsOf(facts, noAssistantCanComeUp));
  return steps;
}

/** The attempt and round a `launch-build` or `launch-review` on each ticket would carry now, read from the log as a pass reads it. */
function nextLaunchNumbersOf(tickets: readonly Pick<PlaybookTicket, 'id' | 'status'>[], logRecords: readonly LogRecord[]): ReadonlyMap<string, NextLaunchNumbers> {
  const facts: IndexedLog = { logRecords, launchesByJobId: jobLaunchesByJobIdOf(logRecords) };
  return new Map(tickets.map((ticket) => [ticket.id, { buildAttempt: nextBuildOf(ticket, facts).attempt, reviewRound: nextReviewRoundOf(ticket.id, facts) }]));
}

export const Playbook = {
  nextStepsOf,
  ticketDocumentFactsOf,
  resumePolicyOf,
  interruptionCauseOf,
  resumeWaitOf,
  resumeIsInstructed,
  lostLineAwaitsResume,
  assistantWaitsForInstruction,
  outageIsDue,
  handoffCycleResumesOf,
  nextLaunchNumbersOf,
} as const;
