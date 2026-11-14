/**
 * Sleep in the home corner. What matters: a Flint that lives in a habitat is placed home to sleep, its gesture and emote end, and it lies
 * still on the home's floor until a cue, a click or a drag wakes it.
 */
import { expect, test } from 'bun:test';

import { createMindRun } from '../../testing/MindRun.ts';

test('sleep places Flint home, ends its gesture and emote, and keeps it still on the home floor', () => {
  const run = createMindRun();
  run.frame({ storedHabitatId: 'chat' });
  run.give('type');
  run.frame();
  run.give('sleep');
  const asleep = run.frame();
  expect([asleep.livesIn, asleep.gesture, asleep.emote, asleep.motion.floorY]).toEqual([null, null, null, 700]);
  const { positionX } = asleep.motion;
  expect(run.runFor(10000).motion.positionX).toBe(positionX);
  expect(run.state().behaviour.name).toBe('sleep');
});

test('a drag wakes a sleeping Flint and carries it', () => {
  const run = createMindRun();
  run.frame();
  run.give('sleep');
  run.frame();
  run.frame({ happenings: [{ kind: 'drag-started' }], pointer: { x: 500, y: 300, hasMoved: true } });
  expect([run.state().behaviour.name, run.state().sleep.phase]).toEqual(['carried', 'waking']);
});
