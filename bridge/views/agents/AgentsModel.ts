/**
 * The Agents view's model: which board records are agent jobs, a job's open decision, its worded Watcher, the job count, whether it is
 * stopping, and whether a concurrency limit asked for may be sent.
 */
import { CONCURRENCY_LIMIT_CEILING_AGENTS, LOWEST_CONCURRENCY_LIMIT_AGENTS } from '../../../src/lib/tracker-model/constants/ConcurrencyLimits.ts';
import type { IdentifiedRecord }                                             from '../../@types/BoardStateDocument.ts';
import type { AgentJobDocument, JobDecisionDocument }                        from './AgentJobDocument.ts';

type JobLiveWording = Pick<AgentJobDocument, 'live'>;

/** A record without live facts is not shown rather than breaking the table: the next `board` carries the whole job again. */
function isAgentJob(record: IdentifiedRecord): record is AgentJobDocument {
  const { live, ticketIds, state } = record as Partial<AgentJobDocument>;
  return typeof live === 'object' && live !== null && Array.isArray(live.subagents) && Array.isArray(ticketIds) && typeof state === 'string';
}

function openDecisionOf(decisions: readonly IdentifiedRecord[], jobId: string): JobDecisionDocument | null {
  return decisions.find((decision): decision is JobDecisionDocument => (decision as Partial<JobDecisionDocument>).jobId === jobId) ?? null;
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

/** A limit to send: a whole number from the lowest limit to the ceiling, which the Overseer refuses past, that differs from the current one. */
function concurrencyLimitIsSendable(wantedLimit: number, currentLimit: number): boolean {
  return wantedLimit !== currentLimit && Number.isInteger(wantedLimit)
    && wantedLimit >= LOWEST_CONCURRENCY_LIMIT_AGENTS && wantedLimit <= CONCURRENCY_LIMIT_CEILING_AGENTS;
}

export const AgentsModel = Object.freeze({
  isAgentJob, openDecisionOf, watcherTextOf, jobCountTextOf, isStopping, concurrencyLimitIsSendable
});
