/**
 * Wander on its floor. What matters: Flint rests, then walks at the walk speed and never past half a body from the floor's ends; the same
 * seed walks the same way each run; it does not walk while it gestures; a Flint off its floor walks back onto it; a Flint that a
 * behaviour left above its floor comes down at the body rate, while its floor still follows the box at once when the page scrolls; and
 * under reduced motion it stands still and on its floor. In a box that keeps Flint inside, it rests its attendants' reach from each wall,
 * and a gesture laid over the rest waits while Flint walks to where the gesture's extent fits, turning when that is nearer, and then
 * plays there, with an emote given meanwhile; under reduced motion at once.
 */
import { describe, expect, test } from 'bun:test';

import { intendedGestureOf }       from '../../IntentMeaning.ts';
import { mindStateAttended }       from '../../SpriteMind.ts';
import { WATCHER_SPARK_ATTENDANT } from '../../attendants/watcher-spark/WatcherSparkAttendant.ts';
import { withGesture }             from '../../mind/MindTransitions.ts';
import { MovementUtil }            from '../../mind/utils/MovementUtil.ts';
import {
  CHAT,
  createMindRun,
  FRAME_MILLISECONDS,
  habitatOf,
  HOME_BOX,
  perceptionOf
} from '../../testing/MindRun.ts';
import type { WanderState } from './WanderBehaviour.ts';

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

describe('in a box that keeps Flint inside', () => {
  const SLOT_BOX = {
    leftX: 700, rightX: 780, topY: 433, floorY: 500,
  };

  function runInSlot(reducedMotion = false): ReturnType<typeof createMindRun> {
    const slot = habitatOf('slot', SLOT_BOX, { keepsFlintInside: true });
    const run = createMindRun(undefined, perceptionOf({ habitats: [CHAT, slot], reducedMotion }));
    run.frame({ storedHabitatId: 'slot' });
    run.runUntil((state) => state.livesIn === 'slot' && state.behaviour.name === 'wander');
    return run;
  }

  test('Flint rests its attendants\' reach from each wall', () => {
    const run = runInSlot();
    run.change((state) => mindStateAttended(state, 'watcher-spark', 4, run.elapsedMilliseconds()));
    const positions: number[] = [];
    for (let i = 0; i < 3000; i++) positions.push(run.frame().motion.positionX);
    const reachUnits = WATCHER_SPARK_ATTENDANT.extent.backUnits;
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(SLOT_BOX.leftX + reachUnits);
    expect(Math.max(...positions)).toBeLessThanOrEqual(SLOT_BOX.rightX - reachUnits);
  });

  test('a gesture laid over the rest waits while Flint walks to where the gesture fits, and plays there', () => {
    const run = runInSlot();
    run.change((state) => ({ ...state, motion: { ...state.motion, positionX: (SLOT_BOX.leftX + SLOT_BOX.rightX) / 2, facing: 1 } }));
    run.give('research');
    run.frame();
    const waiting = run.state();
    const waitingIntent = (waiting.behaviour as WanderState).deferredPlay?.gesture?.intent;
    expect([waiting.gesture, waitingIntent, waiting.motion.walkDirection, waiting.motion.facing]).toEqual([null, 'research', -1, -1]);
    const { extent } = intendedGestureOf('research').form;
    const stepped = run.runFor(500);
    expect(stepped.motion).toMatchObject({ positionX: SLOT_BOX.rightX - extent.frontUnits, facing: 1 });
    expect(stepped.motion.positionX - extent.backUnits).toBeGreaterThanOrEqual(SLOT_BOX.leftX);
    expect(stepped.gesture?.intent).toBe('research');
  });

  test('an emote given while the gesture waits waits beside it, and both play once Flint stands where they fit', () => {
    const run = runInSlot();
    run.change((state) => ({ ...state, motion: { ...state.motion, positionX: (SLOT_BOX.leftX + SLOT_BOX.rightX) / 2, facing: 1 } }));
    run.give('ask');
    run.frame();
    run.give('thinking');
    run.frame();
    expect([run.state().gesture, run.state().emote]).toEqual([null, null]);
    const played = run.runFor(500);
    expect([played.gesture?.intent, played.emote?.name]).toEqual(['ask', 'thinking']);
  });

  test('near a wall it turns where the gesture fits facing the other way, and plays at once', () => {
    const run = runInSlot();
    run.change((state) => ({ ...state, motion: { ...state.motion, positionX: SLOT_BOX.rightX - 20, facing: 1 } }));
    run.give('research');
    run.frame();
    expect(run.state().motion).toMatchObject({ positionX: SLOT_BOX.rightX - 20, facing: -1 });
    expect(run.state().gesture?.intent).toBe('research');
  });

  test('under reduced motion it stands there at once', () => {
    const run = runInSlot(true);
    run.change((state) => ({ ...state, motion: { ...state.motion, positionX: SLOT_BOX.leftX + 20, facing: -1 } }));
    run.give('wave');
    run.frame();
    expect(run.frame().motion).toMatchObject({ positionX: SLOT_BOX.leftX + 20, facing: 1 });
  });
});
