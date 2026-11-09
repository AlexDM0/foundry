/**
 * The activity strip's rows. What matters: only a running row (in progress, not ended) is an agent at work; a row naming the ticket it
 * reviews is Reviewing, every other Building; the ticket's title wins over the row's name, whose leading `#N` is dropped; the longest
 * running comes first and a row without a start comes last, shown without a time.
 */
import { describe, expect, test } from 'bun:test';

import { ActivityStripModel } from './ActivityStripModel.ts';

const TICKETS = [{ id: '004', title: 'Example dark mode' }, { id: '008', title: 'Example rate limits' }];

function exampleTask(changes: Partial<Parameters<typeof ActivityStripModel.activityEntriesOf>[0][number]>) {
  return {
    id: 1, name: '#1 Example row', status: 'in-progress', start: '2026-10-29T10:00:00Z', end: null, ticket: null, ...changes,
  };
}

describe('the running rows', () => {
  test('only an in-progress row without an end is an agent at work', () => {
    const entries = ActivityStripModel.activityEntriesOf([
      exampleTask({ id: 1 }),
      exampleTask({ id: 2, end: '2026-10-29T11:00:00Z' }),
      exampleTask({ id: 3, status: 'paused' }),
    ], TICKETS);
    expect(entries.map((entry) => entry.taskId)).toEqual([1]);
  });

  test('a row naming the ticket it reviews is Reviewing, in the reviewing colours; any other is Building', () => {
    const entries = ActivityStripModel.activityEntriesOf([
      exampleTask({ id: 1, ticket: '004' }),
      exampleTask({ id: 2, reviewOf: '008', start: '2026-10-29T11:00:00Z' }),
    ], TICKETS);
    expect(entries.map(({
      kindLabel, stateToken, ticketId, title
    }) => [kindLabel, stateToken, ticketId, title])).toEqual([
      ['Building', 'in-progress', '004', 'Example dark mode'],
      ['Reviewing', 'reviewing', '008', 'Example rate limits'],
    ]);
  });

  test('a free-standing row shows its own name without the leading number', () => {
    expect(ActivityStripModel.activityEntriesOf([exampleTask({ name: '#12 Example chore' })], TICKETS)[0]?.title).toBe('Example chore');
  });

  test('the longest running comes first, and a row without a readable start comes last with no time', () => {
    const entries = ActivityStripModel.activityEntriesOf([
      exampleTask({ id: 1, start: null }),
      exampleTask({ id: 2, start: '2026-10-29T11:00:00Z' }),
      exampleTask({ id: 3, start: '2026-10-29T09:00:00Z' }),
    ], TICKETS);
    expect(entries.map((entry) => entry.taskId)).toEqual([3, 2, 1]);
    const now = Date.parse('2026-10-29T11:36:00Z');
    expect(entries.map((entry) => ActivityStripModel.elapsedTextOf(entry, now))).toEqual(['2h 36m 00s', '36m 00s', '']);
  });
});
