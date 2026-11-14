/**
 * The pose a Flint slot that stands for jobs asks for: a reviewer reviews, a builder and every other agent types, and with no job Flint
 * idles. A slot that stands for several jobs follows the first running one. Mood and every other pose are the character's work.
 */
import type { FlintPose } from 'design-system/FlintSlot';

/** The fields of a job the pose reads: `AgentJobDocument` satisfies it unchanged. */
export interface PosingJob {
  /** `null` on a job stored without a role; its kind then says whether it reviews. */
  readonly role: string | null;
  readonly kind: string;
}

/** A job of a slot that stands for several: only a running one poses. */
export interface PosingJobWithState extends PosingJob {
  readonly state: string;
}

const REVIEWING_ROLES: ReadonlySet<string> = new Set(['reviewer', 're-reviewer', 'conflict-re-reviewer']);
const REVIEW_JOB_KIND = 'review';
const RUNNING_JOB_STATE = 'running';

function reviews(job: PosingJob): boolean {
  return job.role === null ? job.kind === REVIEW_JOB_KIND : REVIEWING_ROLES.has(job.role);
}

function poseOfJob(job: PosingJob | null): FlintPose {
  if (job === null) return 'idle';
  return reviews(job) ? 'reviewing' : 'typing';
}

/** The pose of the first running job in the order given, the strip's order; `idle` when none runs. */
function poseOfJobs(jobs: readonly PosingJobWithState[]): FlintPose {
  return poseOfJob(jobs.find((job) => job.state === RUNNING_JOB_STATE) ?? null);
}

export const FlintPoseUtil = Object.freeze({ poseOfJob, poseOfJobs });
