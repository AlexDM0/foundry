/**
 * The job-state readings. What matters: a session is up only past its launch and before it stops, and every job state of Gaia's union
 * takes the display state nearest its meaning; an
 * interrupted job takes the wait its served cause names, a network outage or a lost supervision, and no other cause or state does.
 */
import { describe, expect, test } from 'bun:test';

import type { BoardJobState } from '../../@types/board/BoardVocabulary.ts';
import { JobStateUtil }       from './JobStateUtil.ts';

describe('whether a session is up', () => {
  test('a launching, preparing, interrupted or stopping job is not up yet; a running or waiting one is', () => {
    const notUp: readonly BoardJobState[] = ['launching', 'preparing', 'interrupted', 'stopping'];
    const up: readonly BoardJobState[] = ['running', 'waiting-for-answer', 'in-customs'];
    expect(notUp.map(JobStateUtil.isUp)).toEqual([false, false, false, false]);
    expect(up.map(JobStateUtil.isUp)).toEqual([true, true, true]);
  });
});

describe('the display state of a job state', () => {
  test('each job state takes the nearest display state', () => {
    const jobStates: readonly BoardJobState[] = ['launching', 'running', 'waiting-for-answer', 'interrupted', 'stopping', 'in-customs', 'gating', 'merging', 'landing'];
    expect(jobStates.map(JobStateUtil.displayStateOf)).toEqual([
      'committed', 'in-progress', 'paused', 'paused', 'paused', 'in-review', 'in-review', 'reviewed', 'reviewed',
    ]);
  });
});

describe('the wait an interruption names', () => {
  test('a network outage and an ended lease name their wait while the job is interrupted, and nothing once it resumed', () => {
    expect([
      JobStateUtil.displayStateOfJob({ state: 'interrupted', interruption: 'network-outage' }),
      JobStateUtil.displayStateOfJob({ state: 'interrupted', interruption: 'lease-ended' }),
      JobStateUtil.displayStateOfJob({ state: 'interrupted', interruption: 'usage-limit' }),
      JobStateUtil.displayStateOfJob({ state: 'running', interruption: 'network-outage' }),
    ]).toEqual(['network-outage', 'not-supervised', 'paused', 'in-progress']);
    expect(JobStateUtil.interruptionWaitStateOf({ state: 'interrupted', interruption: null })).toBeNull();
  });
});
