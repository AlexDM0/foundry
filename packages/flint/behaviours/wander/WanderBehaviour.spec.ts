/**
 * Wander on its floor. What matters: Flint rests, then walks at the walk speed and never past half a body from the floor's ends; the same
 * seed walks the same way each run; it does not walk while it gestures; a Flint off its floor walks back onto it; a Flint that a
 * behaviour left above its floor comes down at the body rate, while its floor still follows the box at once when the page scrolls; and
 * under reduced motion it stands still and on its floor.
 */
import { describe, expect, test } from 'bun:test';

import { withGesture }  from '../../mind/MindTransitions.ts';
import { MovementUtil } from '../../mind/utils/MovementUtil.ts';
import {
  createMindRun,
  FRAME_MILLISECONDS,
  HOME_BOX,
  perceptionOf
} from '../../testing/MindRun.ts';

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
    run.change((state) => withGesture(state, 'point', run.elapsedMilliseconds()));
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

describe('the floor', () => {
  function liftedBy(liftUnits: number, reducedMotion = false): ReturnType<typeof createMindRun> {
    const run = createMindRun(undefined, perceptionOf({ reducedMotion }));
    run.frame();
    run.change((state) => ({ ...state, motion: { ...state.motion, floorY: HOME_BOX.floorY - liftUnits }, behaviour: { name: 'wander', walkToX: null, restUntilMilliseconds: 0 } }));
    return run;
  }

  test('a Flint a behaviour left above its floor comes down at the body rate, not in one frame', () => {
    const run = liftedBy(70);
    expect(run.frame().motion.floorY).toBeCloseTo(HOME_BOX.floorY - MovementUtil.loweredLiftOf(70, FRAME_MILLISECONDS, false), 10);
    run.runFor(1500);
    expect(run.state().motion.floorY).toBe(HOME_BOX.floorY);
  });

  test('while it comes down, its floor follows the box at once when the page scrolls', () => {
    const run = liftedBy(70);
    const lifted = HOME_BOX.floorY - run.frame().motion.floorY;
    const scrolled = run.frame({ home: { ...HOME_BOX, topY: HOME_BOX.topY - 100, floorY: HOME_BOX.floorY - 100 } });
    expect(scrolled.motion.floorY).toBeCloseTo(HOME_BOX.floorY - 100 - MovementUtil.loweredLiftOf(lifted, FRAME_MILLISECONDS, false), 10);
  });

  test('under reduced motion it is on its floor at once', () => {
    expect(liftedBy(70, true).frame().motion.floorY).toBe(HOME_BOX.floorY);
  });
});

test('under reduced motion Flint stands still, held on its floor', () => {
  const run = createMindRun(undefined, perceptionOf({ reducedMotion: true }));
  run.frame();
  run.change((state) => ({ ...state, motion: { ...state.motion, positionX: 860 } }));
  expect(run.frame().motion.positionX).toBe(LOWEST_X);
  expect(run.runFor(20000).motion.positionX).toBe(LOWEST_X);
});
