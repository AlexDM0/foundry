import type { JobNotLaunchedCause } from '../../domain/tracker-model/@types/Job.ts';

/**
 * Why a chosen program is not kept: a launch's own refusals, or how its run with the version arguments ended: it did not start, it
 * outlived the bound, it ended with a failing exit, or it answered as another program.
 */
export type AgentProgramRefusalCause = JobNotLaunchedCause | 'did-not-start' | 'timed-out' | 'failed' | 'not-this-agent';

/**
 * A program run once with its vendor's version arguments: it runs, with the version it answered, or why it does not; a failed run keeps the
 * first line it printed.
 */
export type AgentProgramCheck =
  | { verdict: 'runs'; programPath: string; version: string }
  | { verdict: 'does-not-run'; programPath: string | null; cause: AgentProgramRefusalCause; outputLine?: string };
