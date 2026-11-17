/**
 * What runs next, derived from the board and the Overseer's observations alone: which jobs launch, resume or are replaced, which tickets park,
 * which decisions and incidents open and which incidents take their default. Pure: it reads no clock, file or process, and every count it
 * acts on is read from the log, so a restart derives the same steps.
 */
import type { Decision } from './@types/Decision.ts';
import type { Incident } from './@types/Incident.ts';
import type {
  InterruptionCause,
  Job,
  JobKind,
  JobOutcome
} from './@types/Job.ts';
import type { LifecycleLimits }                                                                  from './@types/LifecycleLimits.ts';
import type { LogRecord }                                                                        from './@types/LogRecord.ts';
import type { PlaybookObservations, PlaybookStep }                                               from './@types/PlaybookStep.ts';
import type { TicketPriority, TicketStatus }                                                     from './@types/Ticket.ts';
import type { OverseerState }                                                                    from './@types/TrackerProgress.ts';
import { CRASH_INTERRUPTION_CAUSES, FORCED_STOP_REFUSED_INTERRUPTION, HANDOFF_RED_INTERRUPTION } from './constants/JobStates.ts';
import { ConcurrencyUtil }                                                                       from './utils/ConcurrencyUtil.ts';
import { FailedPassUtil }                                                                        from './utils/FailedPassUtil.ts';
import { TicketDefaultsUtil }                                                                    from './utils/TicketDefaultsUtil.ts';
import { TicketDependencyUtil }                                                                  from './utils/TicketDependencyUtil.ts';

export interface PlaybookTicket {
  id:           string;
  status:       TicketStatus;
  priority?:    TicketPriority;
  dependsOn?:   readonly string[];
  hold?:        string;
  group?:       string;
  /** A passed review queued it to land: it waits for its Airlock, never for another review. */
  mergeQueued?: boolean;
}

/** The decisions naming a ticket that hold every launch on it until User answers. */
const TICKET_HOLDING_DECISION_KINDS: readonly Decision['kind'][] = ['waiver', 'branch-touches-agent-config', 'forced-stop-refused', 'budget-reached'];

export interface PlaybookFacts {
  tickets:                     readonly PlaybookTicket[];
  jobs:                        readonly Readonly<Job>[];
  decisions:                   readonly Readonly<Decision>[];
  incidents:                   readonly Readonly<Incident>[];
  /** The log as stored, then what this hold logged. */
  logRecords:                  readonly LogRecord[];
  readinessPositionByTicketId: ReadonlyMap<string, number>;
  concurrencyLimit:            number;
  overseerState:               OverseerState;
  pipelineIsSet:               boolean;
  /** The pipeline has a `review` phase; without one no reviewer is ever launched, and a gated build queues to merge. */
  reviewIsSet:                 boolean;
  observations:                PlaybookObservations;
}

/** The jobs whose spent red resumes park their ticket; an Airlock agent's Airlock parks its own, aborting the merge. */
const TICKET_WORK_JOB_KINDS: readonly JobKind[] = ['review', 'build'];

/** Sessions, which are never resumed once down: a fresh one boots instead. */
const SESSION_JOB_KINDS: readonly JobKind[] = ['assistant', 'product-owner'];

/** A job ended with a report code verified, which breaks a run of crashes across tickets. */
const VERIFIED_OUTCOMES: readonly JobOutcome[] = ['built', 'reviewed', 'round-granted', 'does-not-hold', 'resolved', 'landed', 'integrated', 'refreshed'];

const PRIORITY_RANK: Readonly<Record<TicketPriority, number>> = { high: 0, normal: 1, low: 2 };

/** Within a priority rank a review goes first (it holds finished work), then a rebuild, then a ready build. */
const WORK_PHASE_RANK = { review: 0, rebuild: 1, build: 2 } as const;

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
  ticketIds: readonly string[];
  attempt:   number;
  entity?:   string;
  stage?:    number;
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
}

function isCrash(cause: InterruptionCause | undefined): boolean {
  return cause !== undefined && (CRASH_INTERRUPTION_CAUSES as readonly InterruptionCause[]).includes(cause);
}

function jobLaunchesByJobIdOf(logRecords: readonly LogRecord[]): JobLaunchesByJobId {
  const launches = new Map<string, JobLaunch>();
  for (const record of logRecords) {
    if (record.kind !== 'job-launched') continue;
    const {
      kind, ticketIds, attempt, entity, stage
    } = record.fields;
    launches.set(record.jobId, {
      kind, ticketIds, attempt, ...(entity === undefined ? {} : { entity }), ...(stage === undefined ? {} : { stage })
    });
  }
  return launches;
}

function indexedFactsOf(facts: PlaybookFacts): IndexedPlaybookFacts {
  return {
    ...facts,
    launchesByJobId: jobLaunchesByJobIdOf(facts.logRecords),
    statusById:      new Map(facts.tickets.map((ticket) => [ticket.id, ticket.status])),
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
    if (record.kind === 'overseer-set' && record.fields.state === 'running') crashedTicketKeys = [];
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

/** Back-to-back failed Assistant jobs since the Overseer last started. */
function failedAssistantBootsOf(facts: IndexedPlaybookFacts): number {
  const launches = facts.launchesByJobId;
  let failedBoots = 0;
  for (const record of facts.logRecords) {
    if (record.kind === 'overseer-started') failedBoots = 0;
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
 * hold after the cycle began, since the builder is resumed with that review's findings.
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
    if (cycleBegan && cycle.kind === 'build' && endedReview?.kind === 'review' && endedReview.ticketIds.some((ticketId) => cycle.ticketIds.includes(ticketId))) resumes += 1;
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

/** A fresh build is one attempt past the last; a red handoff's successor, or a builder a review sent back, keeps the last attempt. */
function nextBuildOf(ticket: Pick<PlaybookTicket, 'id' | 'status'>, facts: IndexedLog): { attempt: number; carriesOver: boolean } {
  const carriesOver = redHandoffCarriesOver(ticket.id, facts) || (ticket.status === 'in-progress' && builderReturnsFromReview(ticket.id, facts));
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
  // A question whose job ended holds its ticket until answered, whatever else holds it, so no fresh agent races the answer.
  if (facts.decisions.some((decision) => decision.kind === 'agent-question' && decision.jobId === null && decision.ticketIds.includes(ticket.id))) return true;
  if (facts.incidents.some((incident) => incident.ticketIds.includes(ticket.id))) return true;
  return facts.observations.targetsHoldingManagedBlock.includes(targetOf(ticket, facts.observations));
}

function jobResumeIsHeld(job: Readonly<Job>, facts: PlaybookFacts): boolean {
  if (job.target !== null && facts.observations.targetsHoldingManagedBlock.includes(job.target)) return true;
  return job.ticketIds.some((ticketId) => facts.observations.ticketIdsTouchingAgentConfig.includes(ticketId));
}

/** A session stopped at its question resumes only once the question is answered, so the resume can carry the answer. */
function jobAwaitsAnAnswer(job: Readonly<Job>, facts: PlaybookFacts): boolean {
  return facts.decisions.some((decision) => decision.jobId === job.id)
    || facts.incidents.some((incident) => incident.jobId === job.id && (incident.kind === 'system-question' || incident.kind === 'malformed-ticket'));
}

/** Only a crash counts toward the bound: a reboot, an answer delivery or a usage limit resumes whatever the count. */
function crashResumesAreSpent(job: Readonly<Job>, limits: LifecycleLimits): boolean {
  return isCrash(job.interruption) && job.crashResumes >= limits.JOB_RESUMES_BEFORE_FRESH;
}

/**
 * An intake conversation survives a reboot: an interrupted product owner resumes by id once any question it asked is answered. Past the
 * crash bound it is never resumed: with a question open it waits `awaiting-answer`, otherwise a fresh session takes its intake over.
 */
function productOwnerStepsOf(job: Readonly<Job>, facts: PlaybookFacts, limits: LifecycleLimits, resumesAreHeld: boolean): PlaybookStep[] {
  const awaitsAnAnswer = jobAwaitsAnAnswer(job, facts);
  if (job.state === 'awaiting-answer') return awaitsAnAnswer ? [] : [{ kind: 'refresh-intake', jobId: job.id }];
  if (crashResumesAreSpent(job, limits)) {
    return [{ kind: awaitsAnAnswer ? 'await-answer' : 'refresh-intake', jobId: job.id }];
  }
  return resumesAreHeld || awaitsAnAnswer ? [] : [{ kind: 'resume-job', jobId: job.id }];
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
  const resumeIsHeld = resumesAreHeld || jobResumeIsHeld(job, facts) || jobAwaitsAnAnswer(job, facts);
  return resumeIsHeld ? [] : [{ kind: 'resume-job', jobId: job.id }];
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
    if (SESSION_JOB_KINDS.includes(job.kind)) return [{ kind: 'replace-job', jobId: job.id }];
    if (crashResumesAreSpent(job, limits)) return [{ kind: 'replace-job', jobId: job.id }];
    if (job.kind === 'pipeline-agent') return holds.pipelineAgentResumesAreHeld ? [] : [{ kind: 'resume-job', jobId: job.id }];
    if (resumesAreHeld || jobResumeIsHeld(job, facts) || jobAwaitsAnAnswer(job, facts)) return [];
    return [{ kind: 'resume-job', jobId: job.id }];
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

function candidateOf(ticket: PlaybookTicket, facts: IndexedPlaybookFacts): Candidate | null {
  if (ticket.status !== 'in-review' && ticket.status !== 'in-progress' && ticket.status !== 'pending') return null;
  const base = targetOf(ticket, facts.observations);
  if (ticket.status === 'in-review') {
    if (!facts.reviewIsSet) return null;
    return {
      ticket,
      phase: 'review',
      step:  {
        kind: 'launch-review', ticketId: ticket.id, round: nextReviewRoundOf(ticket.id, facts), target: base
      }
    };
  }
  const { attempt, carriesOver } = nextBuildOf(ticket, facts);
  if (ticket.status === 'in-progress' && (attempt > 1 || carriesOver)) return {
    ticket,
    phase: 'rebuild',
    step:  {
      kind: 'launch-build', ticketId: ticket.id, attempt, base
    }
  };
  if (ticket.status !== 'pending') return null;
  const { statusById } = facts;
  if (TicketDependencyUtil.unsettledDependenciesOf(ticket.dependsOn ?? [], statusById).length > 0) return null;
  return {
    ticket,
    phase: 'build',
    step:  {
      kind: 'launch-build', ticketId: ticket.id, attempt, base
    }
  };
}

function candidateOrder(facts: PlaybookFacts): (a: Candidate, b: Candidate) => number {
  const readinessOf = (candidate: Candidate): number => facts.readinessPositionByTicketId.get(candidate.ticket.id) ?? UNRECORDED_READINESS_POSITION;
  const rankOf      = (candidate: Candidate): number => PRIORITY_RANK[TicketDefaultsUtil.ticketPriorityOf(candidate.ticket)];
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

/** The board's free slots bound the launches first; of those, the ones past the machine's free slots wait as `await-machine-slot`. */
function launchStepsOf(facts: IndexedPlaybookFacts, ticketIdsSettledThisPass: ReadonlySet<string>): PlaybookStep[] {
  const launchable = facts.tickets
    .filter((ticket) => !ticketIdsSettledThisPass.has(ticket.id) && !ticketHasAJob(ticket.id, facts) && !ticketIsHeld(ticket, facts))
    .flatMap((ticket) => candidateOf(ticket, facts) ?? [])
    .sort(candidateOrder(facts))
    .slice(0, freeSlotsOf(facts));
  const machineSlotsFree = facts.observations.machineAgentSlotsFree ?? launchable.length;
  return launchable.map((candidate, index): PlaybookStep => (
    index < machineSlotsFree ? candidate.step : { kind: 'await-machine-slot', ticketId: candidate.ticket.id }
  ));
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

/** A delivered incident defaults when its turn closes. While no Assistant can come up, every one defaults. */
function incidentDefaultStepsOf(facts: PlaybookFacts, noAssistantCanComeUp: boolean): PlaybookStep[] {
  return facts.incidents.flatMap((incident): PlaybookStep[] => {
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
  if (step.kind === 'park') return [step.ticketId];
  return step.kind === 'open-incident' ? step.incident.ticketIds : [];
}

function nextStepsOf(playbookFacts: PlaybookFacts, limits: LifecycleLimits): PlaybookStep[] {
  const facts                   = indexedFactsOf(playbookFacts);
  const outageNow               = facts.overseerState !== 'paused' && outageIsDueWith(facts.logRecords, facts.launchesByJobId, limits);
  const versionOrUsageHolds     = usageLimitHolds(limits) || facts.observations.installVersionChanged;
  // A refused API key refuses every session alike, so nothing starts until User answers the decision naming it.
  const authenticationHolds     = openDecisionOfKind(facts, 'api-authentication-failed');
  // An Assistant stopped at its budget would only spend the next one: no Assistant boots until User answers.
  const assistantBudgetHolds    = facts.decisions.some((decision) => decision.kind === 'budget-reached' && decision.ticketIds.length === 0);
  const outageHolds             = outageNow || openDecisionOfKind(facts, 'outage') || authenticationHolds;
  const resumesAreHeld          = versionOrUsageHolds || !facts.pipelineIsSet || outageHolds;
  const newWorkIsHeld           = resumesAreHeld || facts.overseerState === 'paused';
  const bootsKeepFailing        = failedAssistantBootsOf(facts) >= limits.FAILED_ASSISTANT_BOOTS_BEFORE_DEFAULTING;
  const noAssistantCanComeUp = usageLimitHolds(limits) || authenticationHolds || assistantBudgetHolds || (bootsKeepFailing && !facts.observations.assistantHasAnswered);
  const assistantMayBoot     = !usageLimitHolds(limits) && !authenticationHolds && !assistantBudgetHolds && (!bootsKeepFailing || facts.observations.assistantBootRetryDue);
  const assistantIsLive      = facts.jobs.some((job) => job.kind === 'assistant');

  const steps: PlaybookStep[] = [];
  if (outageNow) steps.push({ kind: 'pause-overseer', cause: 'outage' }, boardDecisionStepOf('outage'));
  if (!facts.pipelineIsSet && !openDecisionOfKind(facts, 'checks-not-set')) steps.push(boardDecisionStepOf('checks-not-set'));
  steps.push(...retiredDecisionStepsOf(facts));
  // The pipeline agent sets the pipeline up, so neither the missing pipeline nor the pause holds its resume.
  steps.push(...crashBoundStepsOf(facts, limits, { resumesAreHeld, pipelineAgentResumesAreHeld: versionOrUsageHolds || outageHolds }));
  steps.push(...waiverAnswerStepsOf(facts));
  if (!assistantIsLive && assistantMayBoot && !facts.observations.installVersionChanged) steps.push({ kind: 'boot-assistant' });
  const parkSteps    = parkStepsOf(facts, limits);
  const jobLostSteps = jobLostStepsOf(facts, limits);
  steps.push(...parkSteps, ...jobLostSteps);
  const ticketIdsSettledThisPass = new Set([...parkSteps, ...jobLostSteps].flatMap(ticketIdsOfStep));
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
  outageIsDue,
  handoffCycleResumesOf,
  nextLaunchNumbersOf,
} as const;
