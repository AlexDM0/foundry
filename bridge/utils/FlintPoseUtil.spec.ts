/**
 * The pose of a Flint slot that stands for jobs (handoff section 9). What matters: a builder types and every reviewing role reviews, the
 * re-reviewers too; a job stored without a role reviews by its kind; no job idles; and a slot of several jobs follows the first running
 * job in the order it is given, skipping one that is not running, and idles when none runs.
 */
import { describe, expect, test } from 'bun:test';

import { FlintPoseUtil, type PosingJobWithState } from './FlintPoseUtil.ts';

function jobOf(role: string | null, kind: string, state = 'running'): PosingJobWithState {
  return { role, kind, state };
}

describe('FlintPoseUtil.poseOfJob', () => {
  test('a builder types', () => {
    expect(FlintPoseUtil.poseOfJob(jobOf('builder', 'build'))).toBe('typing');
  });

  test('a reviewer, a re-reviewer and a conflict re-reviewer review, also as a merge agent', () => {
    expect(['reviewer', 're-reviewer', 'conflict-re-reviewer'].map((role) => FlintPoseUtil.poseOfJob(jobOf(role, 'merge-agent'))))
      .toEqual(['reviewing', 'reviewing', 'reviewing']);
  });

  test('every other agent types: the Assistant, the product owner and the pipeline agent', () => {
    expect(['assistant', 'product-owner', 'pipeline-agent'].map((role) => FlintPoseUtil.poseOfJob(jobOf(role, role))))
      .toEqual(['typing', 'typing', 'typing']);
  });

  test('a job stored without a role reviews by its review kind and types otherwise', () => {
    expect(FlintPoseUtil.poseOfJob(jobOf(null, 'review'))).toBe('reviewing');
    expect(FlintPoseUtil.poseOfJob(jobOf(null, 'build'))).toBe('typing');
  });

  test('no job idles', () => {
    expect(FlintPoseUtil.poseOfJob(null)).toBe('idle');
  });
});

describe('FlintPoseUtil.poseOfJobs', () => {
  test('the first running job in the given order sets the pose', () => {
    expect(FlintPoseUtil.poseOfJobs([jobOf('reviewer', 'review'), jobOf('builder', 'build')])).toBe('reviewing');
    expect(FlintPoseUtil.poseOfJobs([jobOf('builder', 'build'), jobOf('reviewer', 'review')])).toBe('typing');
  });

  test('a job that is not running is passed over', () => {
    expect(FlintPoseUtil.poseOfJobs([jobOf('builder', 'build', 'launching'), jobOf('reviewer', 'review')])).toBe('reviewing');
  });

  test('no running job, or no job at all, idles', () => {
    expect(FlintPoseUtil.poseOfJobs([jobOf('builder', 'build', 'waiting-for-answer'), jobOf('reviewer', 'review', 'gating')])).toBe('idle');
    expect(FlintPoseUtil.poseOfJobs([])).toBe('idle');
  });
});
