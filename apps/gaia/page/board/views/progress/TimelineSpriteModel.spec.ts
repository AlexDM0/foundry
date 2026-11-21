/**
 * What the timeline habitat answers between two payloads (`docs/design/board.md`, "Flint's habitats on the board views", `progress`). What matters: a
 * ticket that becomes `in-progress` has Flint lay the bar along its own row, named by the id of the task at its own row's position, with the fallback
 * `lay-bar` cue; with no own row the element is known to be missing; and a ticket that stays in progress, that is new, or that leaves the state is no
 * change.
 */
import { expect, test } from 'bun:test';

import { TimelineSpriteModel, type TimelineFacts } from './TimelineSpriteModel.ts';

function facts(status: string, ownRowPosition: number | null = 1, tickets: TimelineFacts['tickets'] = [{ id: '001', status }]): TimelineFacts {
  return { tickets, ticketFacts: [{ ticketId: '001', ownRowPosition }], tasks: [{ id: 6 }, { id: 7 }] };
}

const LAY_ALONG_TASK_SEVEN = { intent: 'lay-bar-along', elementKey: '7', fallbackCue: 'started-bar-is-not-shown' } as const;

test('a ticket that becomes in-progress has the bar laid along its own row', () => {
  expect(TimelineSpriteModel.happeningsBetween(facts('committed'), facts('in-progress'))).toEqual({ cueNames: [], elementHappenings: [LAY_ALONG_TASK_SEVEN] });
});

test('with no own row the bar is known not to be shown', () => {
  expect(TimelineSpriteModel.happeningsBetween(facts('committed', null), facts('in-progress', null)).elementHappenings).toEqual([
    { ...LAY_ALONG_TASK_SEVEN, elementKey: null },
  ]);
});

test.each<readonly [string, TimelineFacts, TimelineFacts]>([
  ['a ticket that stays in progress', facts('in-progress'), facts('in-progress')],
  ['a new ticket already in progress', facts('committed', 1, []), facts('in-progress')],
  ['a ticket that leaves in-progress', facts('in-progress'), facts('in-review')],
])('%s is no change', (_description, previous, next) => {
  expect(TimelineSpriteModel.happeningsBetween(previous, next)).toEqual({ cueNames: [], elementHappenings: [] });
});
