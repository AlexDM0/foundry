/**
 * Which of User's controls a live job takes in its state: a fresh agent and a message. The Board's controls refuse what these deny and its
 * offers list what they allow, so the two never drift.
 */
import type { Job } from '../@types/Job.ts';

const STOPPING_STATE = 'stopping';

/** A fresh agent takes the job's ticket over on the same worktree, so a job with no ticket has none to hand on. */
function freshAgentIsOpenTo(job: Pick<Job, 'ticketIds'>): boolean {
  return job.ticketIds.length > 0;
}

/** A stopping job's session takes no further line. */
function messageIsOpenTo(job: Pick<Job, 'state'>): boolean {
  return job.state !== STOPPING_STATE;
}

export const JobControlRuleUtil = Object.freeze({ freshAgentIsOpenTo, messageIsOpenTo });
