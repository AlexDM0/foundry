/**
 * Where Flint lives, as its handle tells it. What matters: with no Flint made, Flint lives nowhere, so no view starts a behaviour on a floor
 * Flint may not stand on; Flint lives in the kind the handle tells and no other, and at home in none; and each question asks the handle
 * again, so a move of Flint is seen at once.
 */
import { expect, test } from 'bun:test';

import { dwellingOf } from './FlintDwelling.ts';

test('with no Flint made, Flint lives nowhere', () => {
  expect(dwellingOf(null).livesIn('tickets')).toBe(false);
});

test('Flint lives in the kind the handle tells and no other, and at home in none; each question asks again', () => {
  let kind: string | null = 'tickets';
  const dwelling = dwellingOf({ livesIn: () => kind });
  expect([dwelling.livesIn('tickets'), dwelling.livesIn('timeline')]).toEqual([true, false]);
  kind = null;
  expect(dwelling.livesIn('tickets')).toBe(false);
  kind = 'timeline';
  expect(dwelling.livesIn('timeline')).toBe(true);
});
