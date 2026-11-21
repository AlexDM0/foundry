/**
 * The job-state readings. What matters: a session is up only past its launch and before it stops, and every job state of Gaia's union
 * takes the display state nearest its meaning.
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
