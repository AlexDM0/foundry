/**
 * Wander on its floor. What matters: Flint rests, then walks at the walk speed and never past half a body from the floor's ends; the same
 * seed walks the same way each run; it does not walk while it gestures; a Flint off its floor walks back onto it; and under reduced
 * motion it stands still.
 */
import { describe, expect, test } from 'bun:test';

import { withGesture } from '../mind/MindTransitions.ts';
import {
  createMindRun,
  FRAME_MILLISECONDS,
  HOME_BOX,
  perceptionOf
} from '../testing/MindRun.ts';

const LOWEST_X = HOME_BOX.leftX + 20;
const HIGHEST_X = HOME_BOX.rightX - 20;

describe('the walk', () => {
  test('Flint rests first, then walks at the walk speed, and stays half a body inside the floor', () => {
    const run = createMindRun();
    run.frame();
    expect(run.runFor(2400).motion.positionX).toBe(1000);
    const positions: number[] = [];
    for (let i = 0; i < 2000; i++) positions.push(run.frame().motion.positionX);
    expect(positions.some((positionX) => positionX !== 1000)).toBe(true);
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(LOWEST_X);
    expect(Math.max(...positions)).toBeLessThanOrEqual(HIGHEST_X);
    const steps = positions.slice(1).map((positionX, i) => Math.abs(positionX - (positions[i] ?? positionX)));
    expect(Math.max(...steps)).toBeCloseTo(220 * FRAME_MILLISECONDS / 1000, 5);
  });

  test('the same seed walks the same way each run', () => {
    const first = createMindRun();
    const second = createMindRun();
    expect(first.runFor(20000).motion.positionX).toBe(second.runFor(20000).motion.positionX);
  });

  test('Flint does not walk while it gestures', () => {
    const run = createMindRun();
    run.frame();
    run.change((state) => withGesture(state, 'point', 'normal', run.elapsedMilliseconds()));
    const positions: number[] = [];
    for (let i = 0; i < 600; i++) positions.push(run.frame().motion.positionX);
    expect(new Set(positions)).toEqual(new Set([1000]));
  });

  test('a Flint off its floor walks back onto it', () => {
    const run = createMindRun();
    run.frame();
    run.change((state) => ({ ...state, motion: { ...state.motion, positionX: 860 } }));
    run.frame();
    expect(run.state().motion.walkDirection).toBe(1);
    expect(run.runFor(500).motion.positionX).toBe(LOWEST_X);
  });
});

test('under reduced motion Flint stands still, held on its floor', () => {
  const run = createMindRun(undefined, perceptionOf({ reducedMotion: true }));
  run.frame();
  run.change((state) => ({ ...state, motion: { ...state.motion, positionX: 860 } }));
  expect(run.frame().motion.positionX).toBe(LOWEST_X);
  expect(run.runFor(20000).motion.positionX).toBe(LOWEST_X);
});
