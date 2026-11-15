/** The hold a stop or a wind-down of a job leaves on the job's ticket, `stopped by User (J4)`: the Board writes it and the Bridge names it. */
import type { JobStopMode } from '../@types/Job.ts';

export type JobStopHoldMode = Exclude<JobStopMode, 'fresh'>;

export const JOB_STOP_HOLD_PHRASES: Readonly<Record<JobStopHoldMode, string>> = Object.freeze({
  'stop':      'stopped by User',
  'wind-down': 'wound down by User',
});

export function jobStopHoldOf(mode: JobStopHoldMode, jobId: string): string {
  return `${JOB_STOP_HOLD_PHRASES[mode]} (${jobId})`;
}
