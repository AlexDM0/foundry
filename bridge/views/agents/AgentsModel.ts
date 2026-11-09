/** The Agents view's model: which board records are agent jobs, a job's open decision, its worded calls and Watcher, the job count, and its controls. */
import type { IdentifiedRecord }                      from '../../@types/BoardStateDocument.ts';
import type { AgentJobDocument, JobDecisionDocument } from './AgentJobDocument.ts';

type JobLiveWording = Pick<AgentJobDocument, 'live'>;

/** Fresh agent replaces a builder or reviewer on its worktree; the other kinds have no worktree of their own to hand on. */
const FRESH_AGENT_KINDS: readonly string[] = ['build', 'review'];

/** A record without live facts is not shown rather than breaking the table: the next `board` carries the whole job again. */
function isAgentJob(record: IdentifiedRecord): record is AgentJobDocument {
  const { live, ticketIds, state } = record as Partial<AgentJobDocument>;
  return typeof live === 'object' && live !== null && Array.isArray(live.subagents) && Array.isArray(ticketIds) && typeof state === 'string';
}

function openDecisionOf(decisions: readonly IdentifiedRecord[], jobId: string): JobDecisionDocument | null {
  return decisions.find((decision): decision is JobDecisionDocument => (decision as Partial<JobDecisionDocument>).jobId === jobId) ?? null;
}

function callsAgainstBudgetOf(job: JobLiveWording): string {
  return job.live.callBudget === null ? String(job.live.calls) : `${job.live.calls} / ${job.live.callBudget}`;
}

function watcherTextOf(job: JobLiveWording): string {
  if (job.live.watcherProtocol === null) return '-';
  return job.live.watchOnly ? `running on Watcher protocol ${job.live.watcherProtocol}: watch only` : `protocol ${job.live.watcherProtocol}`;
}

/** The Agents card's count: `1 job`, `5 jobs`. */
function jobCountTextOf(jobCount: number): string {
  return `${jobCount} ${jobCount === 1 ? 'job' : 'jobs'}`;
}

function isStopping(job: Pick<AgentJobDocument, 'state' | 'stopRequest'>): boolean {
  return job.state === 'stopping' || job.stopRequest !== undefined;
}

function offersFreshAgent(job: Pick<AgentJobDocument, 'kind'>): boolean {
  return FRESH_AGENT_KINDS.includes(job.kind);
}

export const AgentsModel = Object.freeze({
  isAgentJob, openDecisionOf, callsAgainstBudgetOf, watcherTextOf, jobCountTextOf, isStopping, offersFreshAgent
});
