/**
 * The job-state readings. What matters: a session is up only past its launch and before it stops; every job state takes the palette row
 * nearest its meaning; and a state the Bridge does not know, also one named like an object property, reads as waiting instead of breaking.
 */
import { describe, expect, test } from 'bun:test';

import { JobStateUtil } from './JobStateUtil.ts';

describe('whether a session is up', () => {
  test('a launching, preparing, interrupted or stopping job is not up yet; a running or waiting one is', () => {
    expect(['launching', 'preparing', 'interrupted', 'stopping'].map(JobStateUtil.isUp)).toEqual([false, false, false, false]);
    expect(['running', 'waiting-for-answer', 'in-customs'].map(JobStateUtil.isUp)).toEqual([true, true, true]);
  });
});

describe('the palette row of a job state', () => {
  test('each job state takes the nearest display state', () => {
    expect([
      'launching', 'running', 'waiting-for-answer', 'interrupted', 'stopping', 'in-customs', 'gating', 'merging', 'landing',
    ].map(JobStateUtil.paletteStateOf)).toEqual([
      'pending', 'in-progress', 'paused', 'paused', 'paused', 'in-review', 'in-review', 'reviewed', 'reviewed',
    ]);
  });

  test('an unknown state, also one named like an object property, reads as waiting', () => {
    expect(['someday', 'constructor', 'toString'].map(JobStateUtil.paletteStateOf)).toEqual(['pending', 'pending', 'pending']);
  });
});
