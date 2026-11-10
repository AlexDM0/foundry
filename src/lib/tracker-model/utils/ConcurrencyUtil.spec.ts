/**
 * How many launch slots the live jobs take, against which limit. What callers rely on: a slot is a build or review job, never a row, so an
 * in-progress row with no job counts nothing and a session or merge job beside the builds takes nothing; the limit reads the default or the
 * ceiling; no free slot count goes below zero.
 */
import { expect, test } from 'bun:test';

import { CONCURRENCY_LIMIT_CEILING_AGENTS, DEFAULT_CONCURRENCY_LIMIT_AGENTS } from '../constants/ConcurrencyLimits.ts';
import { jobFixture }                                                         from '../testing/LifecycleFixtures.ts';
import { ConcurrencyUtil }                                                    from './ConcurrencyUtil.ts';

const { agentsInFlightOf, concurrencyOf } = ConcurrencyUtil;

const BUILD_JOB = jobFixture({
  id: 'J1', kind: 'build', role: 'builder', ticketIds: ['003', '004']
});
const REVIEW_JOB = jobFixture({
  id: 'J2', kind: 'review', role: 'reviewer', ticketIds: ['005']
});
const ASSISTANT_JOB = jobFixture({
  id: 'J3', kind: 'assistant', role: 'assistant', target: null
});
const MERGE_JOB = jobFixture({
  id: 'J4', kind: 'merge', role: null, ticketIds: ['006']
});

test('only build and review jobs are in flight, and the free slots never go below zero', () => {
  expect(concurrencyOf([BUILD_JOB, REVIEW_JOB, ASSISTANT_JOB, MERGE_JOB], 1)).toEqual({ limit: 1, agentsInFlight: 2, freeSlots: 0 });
});

// One build job takes one slot however many tickets it carries, as a bundle's rows once counted as one agent.
test('a build job carrying several tickets takes one slot', () => {
  expect(agentsInFlightOf([BUILD_JOB])).toBe(1);
});

// The rows say nothing to the count: a by-hand `task add --start` row or a review bar with no live job holds no slot.
test('a board with no live job has every slot free, whatever rows are in progress', () => {
  expect(concurrencyOf([], 2)).toEqual({ limit: 2, agentsInFlight: 0, freeSlots: 2 });
});

// Every tracker filed before the limit existed stores none, and must still read a limit that lets a launch through.
test('a tracker that never stored a limit reads the default one', () => {
  expect(concurrencyOf([], undefined)).toEqual({ limit: DEFAULT_CONCURRENCY_LIMIT_AGENTS, agentsInFlight: 0, freeSlots: DEFAULT_CONCURRENCY_LIMIT_AGENTS });
});

// An older tracker may hold a limit the `concurrency` command would now refuse; it reads as the ceiling rather than failing.
test('a stored limit above the ceiling reads as the ceiling', () => {
  expect(concurrencyOf([], CONCURRENCY_LIMIT_CEILING_AGENTS + 1).limit).toBe(CONCURRENCY_LIMIT_CEILING_AGENTS);
});
