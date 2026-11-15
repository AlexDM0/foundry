/**
 * Which job kinds ask their Watcher to stop the groups the session left as it ends. What matters: a build and a review wind down, so a
 * background command their session left would hold a port and the worktree; every other kind keeps its groups running.
 */
import { expect, test } from 'bun:test';

import type { Job, JobKind }               from '../../lib/tracker-model/@types/Job.ts';
import { SESSION_STOP_GRACE_MILLISECONDS } from '../../shared/constants/OverseerLimits.ts';
import { JobLaunch }                       from './JobLaunch.ts';

const EVERY_JOB_KIND: JobKind[] = ['build', 'review', 'merge', 'merge-agent', 'refresh', 'assistant', 'product-owner', 'pipeline-agent'];
const WINDING_DOWN_KINDS: readonly JobKind[] = ['build', 'review'];

test.each(EVERY_JOB_KIND)('a %s job asks for the stop at the end exactly when it winds down', (kind) => {
  const job = { kind } as Readonly<Job>;
  const expected = WINDING_DOWN_KINDS.includes(kind) ? { treeStopAtEndGraceMilliseconds: SESSION_STOP_GRACE_MILLISECONDS } : {};
  expect(JobLaunch.treeStopAtEndOf(job)).toEqual(expected);
});
