/**
 * A spec shortens Hephaestus's poll interval to run fast. These cases hold that the limits stay as they are with no override,
 * and that a shorter interval keeps the whole wait, so a slow machine does not make a spec's Hephaestus give up sooner.
 */
import { expect, test } from 'bun:test';

import { hephaestusPollScheduleOf } from './HephaestusPollSchedule.ts';

test('with no override the schedule is the limits unchanged', () => {
  expect(hephaestusPollScheduleOf({ tries: 40, intervalMilliseconds: 250 }, undefined)).toEqual({ tries: 40, intervalMilliseconds: 250 });
});

test('a shorter interval polls more often over the same whole wait', () => {
  expect(hephaestusPollScheduleOf({ tries: 40, intervalMilliseconds: 250 }, 25)).toEqual({ tries: 400, intervalMilliseconds: 25 });
});

test('an interval that does not divide the wait rounds the tries up, so the wait is never shorter', () => {
  expect(hephaestusPollScheduleOf({ tries: 40, intervalMilliseconds: 250 }, 3)).toEqual({ tries: 3334, intervalMilliseconds: 3 });
});
