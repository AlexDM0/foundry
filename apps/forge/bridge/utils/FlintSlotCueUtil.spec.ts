/**
 * The cue of a Flint slot that stands for jobs (handoff section 9). What matters: a running builder writes and every running reviewing
 * role reviews, the re-reviewers too; a job stored without a role reviews by its kind; no job, and a job that does not run, is idle; and a
 * slot of several jobs follows the first running job in the order it is given, skipping one that is not running, and is idle when none
 * runs.
 */
import { describe, expect, test } from 'bun:test';

import { FlintSlotCueUtil, type CuedJob } from './FlintSlotCueUtil.ts';

function jobOf(role: string | null, kind: string, state = 'running'): CuedJob {
  return { role, kind, state };
}

describe('FlintSlotCueUtil.cueOfJob', () => {
  test('a builder writes', () => {
    expect(FlintSlotCueUtil.cueOfJob(jobOf('builder', 'build'))).toBe('agent-writes');
  });

  test('a reviewer, a re-reviewer and a conflict re-reviewer review, also as a merge agent', () => {
    expect(['reviewer', 're-reviewer', 'conflict-re-reviewer'].map((role) => FlintSlotCueUtil.cueOfJob(jobOf(role, 'merge-agent'))))
      .toEqual(['agent-reviews', 'agent-reviews', 'agent-reviews']);
  });

  test('every other agent writes: the Assistant, the product owner and the pipeline agent', () => {
    expect(['assistant', 'product-owner', 'pipeline-agent'].map((role) => FlintSlotCueUtil.cueOfJob(jobOf(role, role))))
      .toEqual(['agent-writes', 'agent-writes', 'agent-writes']);
  });

  test('a job stored without a role reviews by its review kind and writes otherwise', () => {
    expect(FlintSlotCueUtil.cueOfJob(jobOf(null, 'review'))).toBe('agent-reviews');
    expect(FlintSlotCueUtil.cueOfJob(jobOf(null, 'build'))).toBe('agent-writes');
  });

  test('no job is idle', () => {
    expect(FlintSlotCueUtil.cueOfJob(null)).toBe('agent-is-idle');
  });

  test('a job that does not run is idle, whatever its role: one that launches, gates, waits on User, was interrupted, stops or ended', () => {
    expect(['launching', 'gating', 'waiting-for-answer', 'interrupted', 'stopping', 'ended'].map((state) => [
      FlintSlotCueUtil.cueOfJob(jobOf('builder', 'build', state)), FlintSlotCueUtil.cueOfJob(jobOf('reviewer', 'review', state)),
    ])).toEqual(Array.from({ length: 6 }, () => ['agent-is-idle', 'agent-is-idle']));
  });
});

describe('FlintSlotCueUtil.cueOfJobs', () => {
  test('the first running job in the given order sets the cue', () => {
    expect(FlintSlotCueUtil.cueOfJobs([jobOf('reviewer', 'review'), jobOf('builder', 'build')])).toBe('agent-reviews');
    expect(FlintSlotCueUtil.cueOfJobs([jobOf('builder', 'build'), jobOf('reviewer', 'review')])).toBe('agent-writes');
  });

  test('a job that is not running is passed over', () => {
    expect(FlintSlotCueUtil.cueOfJobs([jobOf('builder', 'build', 'launching'), jobOf('reviewer', 'review')])).toBe('agent-reviews');
  });

  test('no running job, or no job at all, is idle', () => {
    expect(FlintSlotCueUtil.cueOfJobs([jobOf('builder', 'build', 'waiting-for-answer'), jobOf('reviewer', 'review', 'gating')])).toBe('agent-is-idle');
    expect(FlintSlotCueUtil.cueOfJobs([])).toBe('agent-is-idle');
  });
});
