/**
 * Which jobs hold a launch slot, the one rule behind every concurrency figure and gate. A slot is counted by job kind, never by role: a
 * merge-agent job runs as its ticket's builder or reviewer, yet it never waits behind builds. A document agent holds one for its turns
 * only: waiting for its next message, with no session, it holds none.
 */
import type { Job, JobKind, JobState } from '../@types/Job.ts';

/** The jobs a concurrency slot bounds: merge, refresh and merge-agent jobs never wait behind builds, and sessions have no ticket. */
const SLOT_TAKING_JOB_KINDS: readonly JobKind[] = ['build', 'review'];

const TURN_SLOT_JOB_KIND: JobKind = 'document-agent';

const TURNLESS_STATE: JobState = 'awaiting-answer';

/** A `waiting-for-answer` or `interrupted` job keeps its slot: it is the same job, holding the slot already. */
function jobHoldsLaunchSlot(job: Pick<Job, 'kind' | 'state'>): boolean {
  if (job.kind === TURN_SLOT_JOB_KIND) return job.state !== TURNLESS_STATE;
  return SLOT_TAKING_JOB_KINDS.includes(job.kind);
}

function slotJobIdsOf(jobs: readonly Pick<Job, 'id' | 'kind' | 'state'>[]): string[] {
  return jobs.filter(jobHoldsLaunchSlot).map((job) => job.id);
}

export const LaunchSlotUtil = Object.freeze({ jobHoldsLaunchSlot, slotJobIdsOf });
