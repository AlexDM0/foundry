/**
 * V13 before each launch: the tickets whose branch or worktree changes agent configuration, each hit opening its decision once and holding
 * the ticket until User answers.
 */
import { existsSync }                     from 'node:fs';
import type { Job }                       from '../../domain/tracker-model/@types/Job.ts';
import type { LogRecord }                 from '../../domain/tracker-model/@types/LogRecord.ts';
import type { Pipeline }                  from '../../domain/tracker-model/@types/Pipeline.ts';
import type { DecisionDraft }             from '../../domain/tracker-model/@types/PlaybookStep.ts';
import type { Board }                     from '../../domain/tracker-model/Board.ts';
import { agentConfigTouchedBeforeLaunch } from '../lifecycle/CustomsAgentConfigCheck.ts';
import type { BoardTransaction }          from '../tracker/BoardTransaction.ts';
import type { HoldContext }               from './@types/HoldContext.ts';
import type { JobLaunchContext }          from './@types/JobLaunchContext.ts';
import { JobPipelines }                   from './JobPipelines.ts';
import { WorktreeJobs }                   from './WorktreeJobs.ts';

const AGENT_CONFIG_DECISION = 'branch-touches-agent-config';

/** Once per hit: none while one is open, and none again for a hit User already answered, until another job on the ticket ends. */
function openAgentConfigDecision(hold: HoldContext, job: Readonly<Job>): void {
  const { board, at } = hold.change;
  const ticketId = WorktreeJobs.ticketIdOf(job);
  if (agentConfigHitIsSettled(board, ticketId)) return;
  const draft: DecisionDraft = { kind: AGENT_CONFIG_DECISION, ticketIds: [ticketId], jobId: job.id };
  hold.logged.push(...board.openDecision({
    ...draft, askedBy: 'hephaestus', requestId: null, ...hold.context.decisionWordingOf(draft)
  }, at).logged);
}

function agentConfigHitIsSettled(board: Board, ticketId: string): boolean {
  if (board.decisions().some((decision) => decision.kind === AGENT_CONFIG_DECISION && decision.ticketIds.includes(ticketId))) return true;
  const ticketIdsByJobId = new Map<string, readonly string[]>();
  const kindByDecisionId = new Map<string, { kind: string; ticketIds: readonly string[] }>();
  let answeredSinceTheLastJobEnded = false;
  for (const record of board.logRecordsSoFar()) {
    if (record.kind === 'job-launched') ticketIdsByJobId.set(record.jobId, record.fields.ticketIds);
    if (record.kind === 'decision-opened') kindByDecisionId.set(record.decisionId, record.fields);
    if (record.kind === 'job-ended' && (ticketIdsByJobId.get(record.jobId) ?? []).includes(ticketId)) answeredSinceTheLastJobEnded = false;
    const opened = record.kind === 'decision-answered' ? kindByDecisionId.get(record.decisionId) : undefined;
    if (opened?.kind === AGENT_CONFIG_DECISION && opened.ticketIds.includes(ticketId)) answeredSinceTheLastJobEnded = true;
  }
  return answeredSinceTheLastJobEnded;
}

/**
 * V13 before every launch on a branch, resumes included: the tickets of live worktree jobs whose branch past its target, or whose worktree,
 * changes agent configuration, and those with the decision still open. On a pipeline with entities, every entity home is protected too.
 * Read outside the lock.
 */
function ticketIdsTouchingAgentConfigOf(context: JobLaunchContext, jobs: readonly Readonly<Job>[], pipeline: Readonly<Pipeline> | null = null): string[] {
  const { projectPrefix } = WorktreeJobs.projectLocationOfContext(context);
  const entityHomes = JobPipelines.entityHomesOf(pipeline);
  return jobs.filter(WorktreeJobs.isWorktreeJob).filter((job) => {
    const worktree = WorktreeJobs.worktreeOf(context.workspace, job);
    if (!existsSync(worktree)) return false;
    const target = job.target ?? context.mainLine;
    const { configurationNames } = context.agentAdapter;
    return agentConfigTouchedBeforeLaunch(worktree, target, configurationNames, context.platformPorts.dataFolders, projectPrefix, entityHomes).verdict === 'refused';
  }).map(WorktreeJobs.ticketIdOf);
}

/** In the hold: each observed hit opens its decision once, and holds the ticket until User answered it. */
function holdAgentConfigHits(change: BoardTransaction, context: JobLaunchContext, touchingTicketIds: readonly string[]): { held: string[]; logged: LogRecord[] } {
  const hold: HoldContext = {
    change, context, pipelineStored: false, logged: []
  };
  const held = new Set<string>();
  for (const ticketId of touchingTicketIds) {
    const job = change.board.jobs().find((candidate) => candidate.ticketIds.includes(ticketId));
    if (agentConfigHitIsSettled(change.board, ticketId)) continue;
    if (job !== undefined) openAgentConfigDecision(hold, job);
  }
  for (const decision of change.board.decisions()) {
    if (decision.kind === AGENT_CONFIG_DECISION) decision.ticketIds.forEach((ticketId) => held.add(ticketId));
  }
  return { held: [...held].sort(), logged: hold.logged };
}

export const AgentConfigHits = Object.freeze({
  openAgentConfigDecision,
  ticketIdsTouchingAgentConfigOf,
  holdAgentConfigHits,
});
