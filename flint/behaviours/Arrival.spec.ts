/**
 * The end of a visit or a landing. What matters: Flint lives in the habitat and rests there, the habitat hears `arrived` in place of the
 * cues of the place Flint left, the greeting the arrival carried out is kept so it is not repeated, and a stored habitat no longer applies.
 */
import { expect, test } from 'bun:test';

import { INITIAL_MIND_STATE } from '../SpriteMind.ts';
import { withArrival }        from './Arrival.ts';

test('an arrival makes the habitat hear arrived in place of the cues of the place Flint left, and Flint rests there', () => {
  const before = { ...INITIAL_MIND_STATE, directorInbox: ['agent-is-writing'], recentCues: ['agent-is-writing'] };
  const arrived = withArrival(before, 'chat', 1000, 'wave');
  expect([arrived.livesIn, arrived.directorInbox, arrived.recentCues, arrived.arrivalGreeting, arrived.behaviour.name, arrived.mayRestoreStoredHabitat])
    .toEqual(['chat', ['arrived'], ['arrived'], 'wave', 'wander', false]);
});

test('an arrival with no greeting of its own keeps none', () => {
  expect(withArrival(INITIAL_MIND_STATE, 'chat', 0, null).arrivalGreeting).toBeNull();
});
