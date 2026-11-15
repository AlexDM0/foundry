/**
 * Which jobs hold a launch slot, the one rule behind every concurrency figure and gate. A slot is counted by job kind, never by role: a
 * merge-agent job runs as its ticket's builder or reviewer, yet it never waits behind builds.
 */
import type { Job, JobKind } from '../@types/Job.ts';

/** The jobs a concurrency slot bounds: merge, refresh and merge-agent jobs never wait behind builds, and sessions have no ticket. */
const SLOT_TAKING_JOB_KINDS: readonly JobKind[] = ['build', 'review'];

/** A `waiting-for-answer` or `interrupted` job keeps its slot: it is the same job, holding the slot already. */
function jobHoldsLaunchSlot(job: Pick<Job, 'kind'>): boolean {
  return SLOT_TAKING_JOB_KINDS.includes(job.kind);
}

function slotJobIdsOf(jobs: readonly Pick<Job, 'id' | 'kind'>[]): string[] {
  return jobs.filter(jobHoldsLaunchSlot).map((job) => job.id);
}

export const LaunchSlotUtil = Object.freeze({ jobHoldsLaunchSlot, slotJobIdsOf });
