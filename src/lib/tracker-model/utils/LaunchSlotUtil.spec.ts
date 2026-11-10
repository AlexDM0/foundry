/**
 * Which jobs hold a launch slot. What matters is that the rule reads the job's kind and never its role: a merge-agent job runs as its
 * ticket's builder or reviewer, yet it never waits behind builds, so a role rule would count a job no gate holds back. A build or review
 * that waits for an answer or was interrupted is the same job and keeps its slot, so its state never frees one.
 */
import { expect, test } from 'bun:test';

import type { JobKind }   from '../@types/Job.ts';
import { jobFixture }     from '../testing/LifecycleFixtures.ts';
import { LaunchSlotUtil } from './LaunchSlotUtil.ts';

const { jobHoldsLaunchSlot, slotJobIdsOf } = LaunchSlotUtil;

test('a build job and a review job each hold a launch slot', () => {
  expect(jobHoldsLaunchSlot(jobFixture({ id: 'J1', kind: 'build', role: 'builder' }))).toBe(true);
  expect(jobHoldsLaunchSlot(jobFixture({ id: 'J2', kind: 'review', role: 'reviewer' }))).toBe(true);
});

test('a merge-agent job running as its ticket\'s builder or reviewer holds no launch slot', () => {
  expect(jobHoldsLaunchSlot(jobFixture({ id: 'J3', kind: 'merge-agent', role: 'builder' }))).toBe(false);
  expect(jobHoldsLaunchSlot(jobFixture({ id: 'J4', kind: 'merge-agent', role: 'reviewer' }))).toBe(false);
});

test('session, onboarder, merge and refresh jobs hold no launch slot', () => {
  const slotlessKinds: JobKind[] = ['assistant', 'product-owner', 'onboarder', 'merge', 'refresh'];
  const holdingKinds = slotlessKinds.filter((kind) => jobHoldsLaunchSlot(jobFixture({ id: 'J5', kind, role: null })));
  expect(holdingKinds).toEqual([]);
});

test('a build waiting for an answer and an interrupted build keep their launch slots', () => {
  expect(jobHoldsLaunchSlot(jobFixture({ id: 'J6', state: 'waiting-for-answer' }))).toBe(true);
  expect(jobHoldsLaunchSlot(jobFixture({ id: 'J7', state: 'interrupted', interruption: 'reboot' }))).toBe(true);
});

test('the slot job ids are the build and review jobs, in launch order', () => {
  const jobs = [
    jobFixture({ id: 'J10', kind: 'assistant', role: 'assistant' }),
    jobFixture({ id: 'J11', kind: 'review', role: 'reviewer' }),
    jobFixture({ id: 'J12', kind: 'merge-agent', role: 'builder' }),
    jobFixture({ id: 'J13', kind: 'build', role: 'builder' }),
  ];
  expect(slotJobIdsOf(jobs)).toEqual(['J11', 'J13']);
});
