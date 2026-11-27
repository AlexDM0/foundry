/** Who the Airlock agents of a merge job are and were, read from the log: the next agent to launch, its scope and how often it resumed. */
import type { KeptAirlockFacts }                                       from '../../adapters/airlock-facts/AirlockFactsIngestion.ts';
import type { Job, JobRole }                                           from '../../domain/tracker-model/@types/Job.ts';
import type { Board }                                                  from '../../domain/tracker-model/Board.ts';
import { HANDOFF_RED_INTERRUPTION }                                    from '../../domain/tracker-model/constants/JobStates.ts';
import { TicketStageUtil }                                             from '../../domain/tracker-model/utils/TicketStageUtil.ts';
import type { ConflictPart }                                           from '../lifecycle/MergeRun.ts';
import type { AirlockAgentHistory, AirlockAgentScope, EntityAndStage } from './@types/AirlockAgents.ts';
import { ticketIdOf }                                                  from './AirlockReadings.ts';
import { JobResumption }                                               from './JobResumption.ts';

const PACKAGE_BUILD_STAGE_NUMBER  = TicketStageUtil.stageNumberOf('package-build');
const PACKAGE_REVIEW_STAGE_NUMBER = TicketStageUtil.stageNumberOf('package-review');

/** An agent interrupted, or waiting through the gate with its session stopped, holds nothing; any other awaits its spawn, runs or reported. */
export const MERGE_AGENT_STATES_HOLDING_NO_SLOT: ReadonlySet<Job['state']> = new Set<Job['state']>(['interrupted', 'gating']);

export function entityAndStageOf(launch: EntityAndStage): EntityAndStage {
  return { ...(launch.entity === undefined ? {} : { entity: launch.entity }), ...(launch.stage === undefined ? {} : { stage: launch.stage }) };
}

/**
 * The ticket's last worker from history, whatever the pipeline says now; with none ended, its reviewer, or its builder with no review
 * step. On a pipeline with entities it runs the entity and stage its launch logged, so its own session is resumed: the home's worker (E63).
 */
export function homeWorkerScopeOf(board: Board, ticketId: string): AirlockAgentScope {
  const logRecords = board.logRecordsSoFar();
  const lastWorker = JobResumption.lastWorkerOf(logRecords, ticketId);
  const role: JobRole = lastWorker?.role ?? (board.reviewIsSetFor(ticketId) ? 'reviewer' : 'builder');
  if (board.pipeline()?.entities === undefined || lastWorker === null) return { role };
  const launch = logRecords.find((record) => record.kind === 'job-launched' && record.jobId === lastWorker.jobId);
  return launch?.kind === 'job-launched' ? { role, ...entityAndStageOf(launch.fields) } : { role };
}

/** A sealed package's part goes to that package's builder (E62); the home's part to the home's worker. */
export function conflictPartScopeOf(part: Readonly<ConflictPart>, homeScope: AirlockAgentScope): AirlockAgentScope {
  return part.packageEntity === null ? homeScope : { role: 'builder', entity: part.packageEntity, stage: PACKAGE_BUILD_STAGE_NUMBER };
}

/** What the agent of one part of a conflict is told through the kept facts; a ticket that crossed into no package keeps only its files. */
export function conflictPartFactsOf(part: Readonly<ConflictPart>, filesResolvedBefore: readonly string[]): KeptAirlockFacts {
  return { conflictedFiles: part.files, leavesTheMergeOpen: part.leavesTheMergeOpen, filesResolvedBefore };
}

/** The agents launched under the merge job, in launch order, as their launches logged them. */
function airlockAgentLaunchesOf(board: Board, job: Readonly<Job>): ({ role: JobRole | null } & EntityAndStage)[] {
  return board.logRecordsSoFar().flatMap((record) => (
    record.kind === 'job-launched' && record.fields.parentJobId === job.id ? [{ role: record.fields.role, ...entityAndStageOf(record.fields) }] : []
  ));
}

/**
 * The conflict re-reviewer a resolution still needs, in order: the home's, when its resolution is too large to merge unread; then
 * one of each package whose builder resolved a part, whatever its size (E62). `null` once each one needed was launched.
 */
export function nextConflictReReviewerOf(board: Board, job: Readonly<Job>, homeNeedsAReReview: boolean): AirlockAgentScope | null {
  const launches = airlockAgentLaunchesOf(board, job);
  const reReviewedEntities = launches.filter((launch) => launch.role === 'conflict-re-reviewer').map((launch) => launch.entity);
  const homeScope = homeWorkerScopeOf(board, ticketIdOf(job));
  const homeReReviewer: AirlockAgentScope = { ...entityAndStageOf(homeScope), role: 'conflict-re-reviewer' };
  const resolvedPackages = [...new Set(launches.flatMap((launch) => (launch.stage === PACKAGE_BUILD_STAGE_NUMBER && launch.entity !== undefined ? [launch.entity] : [])))];
  const queue: AirlockAgentScope[] = [
    ...(homeNeedsAReReview ? [homeReReviewer] : []),
    ...resolvedPackages.map((packageEntity): AirlockAgentScope => ({ role: 'conflict-re-reviewer', entity: packageEntity, stage: PACKAGE_REVIEW_STAGE_NUMBER })),
  ];
  return queue.find((reReviewer) => !reReviewedEntities.includes(reReviewer.entity)) ?? null;
}

/**
 * A package's builder in the Airlock resumes the newest session of that package's build (E62), as its launch states it; with none to
 * resume it starts a fresh session of its own, the same test the launch's budget statement makes.
 */
function startsAFreshSession(
  board: Board, jobId: string, launch: Readonly<{ kind: Job['kind']; role: Job['role']; ticketIds: readonly string[]; parentJobId: Job['parentJobId'] }> & EntityAndStage
): boolean {
  const subject = {
    id: jobId, kind: launch.kind, role: launch.role, ticketIds: [...launch.ticketIds], parentJobId: launch.parentJobId, ...entityAndStageOf(launch)
  };
  return JobResumption.sessionOwnerJobIdOf(board.logRecordsSoFar(), subject) === jobId;
}

export function airlockAgentHistoryOf(board: Board, job: Readonly<Job>): AirlockAgentHistory {
  const launchByJobId = new Map<string, { attempt: number; role: JobRole | null } & EntityAndStage>();
  const freshAgentIds = new Set<string>();
  let resumes = 0;
  let newestEnding: AirlockAgentHistory['newestEnding'] = null;
  for (const record of board.logRecordsSoFar()) {
    if (record.kind === 'job-launched' && record.fields.parentJobId === job.id) {
      launchByJobId.set(record.jobId, { attempt: record.fields.attempt, role: record.fields.role, ...entityAndStageOf(record.fields) });
      const isFresh = newestEnding?.outcome === 'replaced' || record.fields.role === 'conflict-re-reviewer'
        || (record.fields.stage === PACKAGE_BUILD_STAGE_NUMBER && startsAFreshSession(board, record.jobId, record.fields));
      if (isFresh) freshAgentIds.add(record.jobId);
      else resumes += 1;
    }
    if (record.kind === 'job-resumed' && launchByJobId.has(record.jobId) && record.fields.cause === HANDOFF_RED_INTERRUPTION) resumes += 1;
    const launch = record.kind === 'job-ended' ? launchByJobId.get(record.jobId) : undefined;
    if (record.kind === 'job-ended' && launch !== undefined) newestEnding = { jobId: record.jobId, outcome: record.fields.outcome, ...launch };
  }
  return { resumes, freshAgentIds, newestEnding };
}

/** How often the agent's session was resumed after a red handoff. */
export function redResumesOf(board: Board, agent: Readonly<Job>): number {
  return board.logRecordsSoFar().filter((record) => record.kind === 'job-resumed' && record.jobId === agent.id && record.fields.cause === HANDOFF_RED_INTERRUPTION).length;
}
