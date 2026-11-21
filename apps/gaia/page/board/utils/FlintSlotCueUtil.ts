/**
 * The cue of a Flint slot that stands for jobs: a running reviewer reviews, a running builder and every other running agent writes, and
 * with no running job the agent is idle. A slot that stands for several jobs follows the first running one.
 */
import { FLINT_SLOT_CUES, type FlintSlotCue } from '../flint/FlintSlotCues.ts';

/** The fields of a job the cue reads: a board job and a strip chip satisfy it unchanged. */
export interface CuedJob {
  /** `null` on a job stored without a role; its kind then says whether it reviews. */
  readonly role:  string | null;
  readonly kind:  string;
  readonly state: string;
}

const REVIEWING_ROLES: ReadonlySet<string> = new Set(['reviewer', 're-reviewer', 'conflict-re-reviewer']);
const REVIEW_JOB_KIND = 'review';
const RUNNING_JOB_STATE = 'running';

function reviews(job: CuedJob): boolean {
  return job.role === null ? job.kind === REVIEW_JOB_KIND : REVIEWING_ROLES.has(job.role);
}

/** Idle for no job and for a job that does not run: one that launches, gates, waits on User, was interrupted, stops or ended. */
function cueOfJob(job: CuedJob | null): FlintSlotCue {
  if (job === null || job.state !== RUNNING_JOB_STATE) return FLINT_SLOT_CUES.AGENT_IS_IDLE;
  return reviews(job) ? FLINT_SLOT_CUES.AGENT_REVIEWS : FLINT_SLOT_CUES.AGENT_WRITES;
}

/** The cue of the first running job in the order given, the strip's order; idle when none runs. */
function cueOfJobs(jobs: readonly CuedJob[]): FlintSlotCue {
  return cueOfJob(jobs.find((job) => job.state === RUNNING_JOB_STATE) ?? null);
}

export const FlintSlotCueUtil = Object.freeze({ cueOfJob, cueOfJobs });
