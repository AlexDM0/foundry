/**
 * The activity strip's facts. What matters: a chip exists only for a job the board names in `launchSlots`, since the Overseer counts a
 * slot by job kind (a merge agent runs as a builder yet holds none) and the Bridge must not count by a rule of its own; a running build
 * and a running review take the in-progress and reviewing palettes, any other state its nearest row; a chip's time is the job's launch
 * stamp, the longest running first and a launching job without one last; a chip carries the job's role, kind and state, which Flint's
 * slot poses by; the counts split the slot jobs by kind, the without-job count is the board's list and the slot limit is the board's; a
 * board without launch slots shows nothing.
 */
import { describe, expect, test } from 'bun:test';

import type { LaunchSlotsDocument } from '../@types/BoardStateDocument.ts';
import { exampleAgentJob }          from '../testing/BoardStateFixture.ts';
import { ActivityStripModel }       from './ActivityStripModel.ts';

const TICKETS = [{ id: '004', title: 'Example dark mode' }, { id: '008', title: 'Example rate limits' }];

const BUILDER = exampleAgentJob({ id: 'J2', ticketIds: ['004'], launchedAt: '2026-10-29T10:00:00Z' });

const REVIEWER = exampleAgentJob({
  id: 'J5', kind: 'review', role: 'reviewer', ticketIds: ['008'], launchedAt: '2026-10-29T11:00:00Z'
});

const ASSISTANT = exampleAgentJob({
  id: 'J1', kind: 'assistant', role: 'assistant', ticketIds: []
});

const PRODUCT_OWNER = exampleAgentJob({
  id: 'J3', kind: 'product-owner', role: 'product-owner', ticketIds: []
});

const MERGE_AGENT = exampleAgentJob({
  id: 'J4', kind: 'merge-agent', role: 'builder', ticketIds: ['008']
});

function slots(slotJobIds: readonly string[], inProgressTicketIdsWithoutJob: readonly string[] = []): LaunchSlotsDocument {
  return { limit: 5, slotJobIds, inProgressTicketIdsWithoutJob };
}

describe('which jobs get a chip', () => {
  test('only a job the board names as holding a launch slot gets one; the Assistant, a product owner and a merge agent get none', () => {
    const facts = ActivityStripModel.activityStripFactsOf(slots(['J2', 'J5']), [ASSISTANT, BUILDER, PRODUCT_OWNER, MERGE_AGENT, REVIEWER], TICKETS);
    expect(facts.chips.map((chip) => chip.jobId)).toEqual(['J2', 'J5']);
  });

  test('a board without launch slots shows no chip and counts nothing', () => {
    expect(ActivityStripModel.activityStripFactsOf(undefined, [BUILDER, REVIEWER], TICKETS)).toEqual({
      chips: [], slotLimit: null, buildingCount: 0, reviewingCount: 0, ticketCountWithoutJob: 0,
    });
  });

  test('a record without live facts gets no chip, even when the board names it', () => {
    expect(ActivityStripModel.activityStripFactsOf(slots(['J9']), [{ id: 'J9' }], TICKETS).chips).toEqual([]);
  });
});

describe('what a chip shows', () => {
  test('a running build takes the in-progress palette, a running review the reviewing one, a build waiting for an answer the paused one', () => {
    const waiting = exampleAgentJob({ id: 'J6', state: 'waiting-for-answer', launchedAt: '2026-10-29T11:30:00Z' });
    const facts = ActivityStripModel.activityStripFactsOf(slots(['J2', 'J5', 'J6']), [BUILDER, REVIEWER, waiting], TICKETS);
    expect(facts.chips.map(({ jobId, stateToken }) => [jobId, stateToken])).toEqual([['J2', 'in-progress'], ['J5', 'reviewing'], ['J6', 'paused']]);
  });

  test('its role and its first ticket\'s title, or the job id when the board lists no such ticket', () => {
    const unknownTicket = exampleAgentJob({ id: 'J7', ticketIds: ['099'], launchedAt: '2026-10-29T11:40:00Z' });
    const facts = ActivityStripModel.activityStripFactsOf(slots(['J5', 'J7']), [REVIEWER, unknownTicket], TICKETS);
    expect(facts.chips.map(({ roleLabel, ticketId, title }) => [roleLabel, ticketId, title])).toEqual([
      ['reviewer', '008', 'Example rate limits'],
      ['builder', '099', 'J7'],
    ]);
  });

  test('it carries the job\'s role, kind and state, a role the job lacks as null', () => {
    const roleless = exampleAgentJob({
      id: 'J9', kind: 'review', role: null, state: 'waiting-for-answer', launchedAt: '2026-10-29T11:50:00Z'
    });
    const facts = ActivityStripModel.activityStripFactsOf(slots(['J2', 'J9']), [BUILDER, roleless], TICKETS);
    expect(facts.chips.map(({ role, kind, state }) => [role, kind, state])).toEqual([['builder', 'build', 'running'], [null, 'review', 'waiting-for-answer']]);
  });

  test('the longest running comes first by launch stamp, and a launching job with no stamp comes last with no time', () => {
    const launching = exampleAgentJob({ id: 'J1', state: 'launching', launchedAt: null });
    const facts = ActivityStripModel.activityStripFactsOf(slots(['J1', 'J2', 'J5']), [launching, REVIEWER, BUILDER], TICKETS);
    expect(facts.chips.map((chip) => chip.jobId)).toEqual(['J2', 'J5', 'J1']);
    const now = new Date('2026-10-29T11:36:00Z');
    expect(facts.chips.map((chip) => ActivityStripModel.elapsedTextOf(chip, now))).toEqual(['1h 36m 00s', '36m 00s', '']);
  });
});

describe('the counts', () => {
  test('the slot jobs split into building and reviewing by kind, and the without-job count is the board\'s list', () => {
    const secondBuilder = exampleAgentJob({ id: 'J8', ticketIds: ['008'] });
    const facts = ActivityStripModel.activityStripFactsOf(slots(['J2', 'J5', 'J8'], ['011', '012']), [BUILDER, REVIEWER, secondBuilder, ASSISTANT], TICKETS);
    expect([facts.buildingCount, facts.reviewingCount, facts.ticketCountWithoutJob]).toEqual([2, 1, 2]);
  });

  test('the slot limit is the board\'s launch slot limit', () => {
    expect(ActivityStripModel.activityStripFactsOf(slots(['J2']), [BUILDER], TICKETS).slotLimit).toBe(5);
  });
});
