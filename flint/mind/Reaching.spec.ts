/**
 * A grab the host aims at an element, as the playground's grab at its floating square. What matters: Flint turns to the target when the
 * grab starts and not again; the grab's target is relative to the bottom tip and mirrored by the facing, and follows a moving target;
 * the catch verdict is taken against it; and without a grab the target changes nothing.
 */
import { describe, expect, test } from 'bun:test';

import { HOVER }                       from '../constants/Motion.ts';
import { createMindRun, perceptionOf } from '../testing/MindRun.ts';

describe('the aimed grab', () => {
  test('Flint turns to a target on its left when the grab starts, and aims at it mirrored', () => {
    const run = createMindRun(undefined, perceptionOf({ reachTarget: { x: 960, y: 640 }, reducedMotion: true }));
    run.frame();
    run.give('grab');
    const grabbing = run.frame();
    expect(grabbing.motion.facing).toBe(-1);
    expect(grabbing.gesture?.target).toEqual({ x: 40, y: 640 - (700 - HOVER.HEIGHT_UNITS) });
  });

  test('the aim follows a target that moves, and Flint does not turn again', () => {
    const run = createMindRun(undefined, perceptionOf({ reachTarget: { x: 1030, y: 640 }, reducedMotion: true }));
    run.frame();
    run.give('grab');
    run.frame();
    const moved = run.frame({ reachTarget: { x: 990, y: 650 } });
    expect(moved.motion.facing).toBe(1);
    expect(moved.gesture?.target?.x).toBe(-10);
  });

  test('a near target is caught and a far one missed', () => {
    const near = createMindRun(undefined, perceptionOf({ reachTarget: { x: 1030, y: 670 } }));
    near.frame();
    near.give('grab');
    near.runFor(300);
    expect(near.state().gesture?.verdict).toBe(true);
    const far = createMindRun(undefined, perceptionOf({ reachTarget: { x: 1090, y: 600 } }));
    far.frame();
    far.give('grab');
    far.runFor(300);
    expect(far.state().gesture?.verdict).toBe(false);
  });

  test('without a grab, a target changes nothing', () => {
    const run = createMindRun(undefined, perceptionOf({ reachTarget: { x: 960, y: 640 } }));
    expect(run.frame().motion.facing).toBe(1);
  });
});
